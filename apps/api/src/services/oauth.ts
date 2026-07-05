import { SignJWT, jwtVerify } from 'jose';
import { eq, and } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { users } from '../db/schema';
import { createSession } from './session';
import { recordLogin } from './login-events';

export type OAuthProvider = 'google' | 'microsoft';

interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

const secret = new TextEncoder().encode(config.jwtSecret);

function isGoogleConfigured() {
  return Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret);
}

function isMicrosoftConfigured() {
  return Boolean(config.oauth.microsoft.clientId && config.oauth.microsoft.clientSecret);
}

export function getEnabledProviders() {
  return {
    google: isGoogleConfigured(),
    microsoft: isMicrosoftConfigured(),
  };
}

async function createState(provider: OAuthProvider): Promise<string> {
  return new SignJWT({ provider })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

async function verifyState(state: string, expectedProvider: OAuthProvider): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, secret);
    return payload.provider === expectedProvider;
  } catch {
    return false;
  }
}

function redirectUri(provider: OAuthProvider) {
  return `${config.oauth.apiUrl}/api/auth/oauth/${provider}/callback`;
}

export async function getAuthorizationUrl(provider: OAuthProvider): Promise<string | null> {
  if (provider === 'google' && !isGoogleConfigured()) return null;
  if (provider === 'microsoft' && !isMicrosoftConfigured()) return null;

  const state = await createState(provider);

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: config.oauth.google.clientId,
      redirect_uri: redirectUri('google'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const tenant = config.oauth.microsoft.tenantId;
  const params = new URLSearchParams({
    client_id: config.oauth.microsoft.clientId,
    redirect_uri: redirectUri('microsoft'),
    response_type: 'code',
    scope: 'openid profile email User.Read',
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: redirectUri('google'),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) throw new Error('Google token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) throw new Error('Google profile fetch failed');
  const profile = (await profileRes.json()) as { id: string; email: string; name: string; picture?: string };

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture,
  };
}

async function exchangeMicrosoftCode(code: string): Promise<OAuthProfile> {
  const tenant = config.oauth.microsoft.tenantId;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.microsoft.clientId,
      client_secret: config.oauth.microsoft.clientSecret,
      redirect_uri: redirectUri('microsoft'),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) throw new Error('Microsoft token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) throw new Error('Microsoft profile fetch failed');
  const profile = (await profileRes.json()) as {
    id: string;
    mail?: string;
    userPrincipalName: string;
    displayName: string;
  };

  return {
    id: profile.id,
    email: profile.mail ?? profile.userPrincipalName,
    name: profile.displayName,
  };
}

async function findOrCreateOAuthUser(provider: OAuthProvider, profile: OAuthProfile) {
  const [byOAuth] = await db
    .select()
    .from(users)
    .where(and(eq(users.oauthProvider, provider), eq(users.oauthId, profile.id)))
    .limit(1);

  if (byOAuth) {
    const [updated] = await db
      .update(users)
      .set({
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byOAuth.id))
      .returning();
    return updated;
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);

  if (byEmail) {
    const [linked] = await db
      .update(users)
      .set({
        oauthProvider: provider,
        oauthId: profile.id,
        avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl,
        name: byEmail.name || profile.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    return linked;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: profile.email,
      name: profile.name,
      oauthProvider: provider,
      oauthId: profile.id,
      avatarUrl: profile.avatarUrl,
      role: 'student',
    })
    .returning();

  return created;
}

function serializeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
    avatarUrl: user.avatarUrl ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function handleOAuthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<{ redirectUrl: string }> {
  const validState = await verifyState(state, provider);
  if (!validState) {
    return { redirectUrl: `${config.oauth.webUrl}/login?error=invalid_state` };
  }

  try {
    const profile =
      provider === 'google' ? await exchangeGoogleCode(code) : await exchangeMicrosoftCode(code);

    const user = await findOrCreateOAuthUser(provider, profile);
    const sessionId = await createSession({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await recordLogin(user.id, provider === 'google' ? 'oauth_google' : 'oauth_microsoft');

    const params = new URLSearchParams({ session: sessionId });
    return { redirectUrl: `${config.oauth.webUrl}/auth/callback?${params}` };
  } catch {
    return { redirectUrl: `${config.oauth.webUrl}/login?error=oauth_failed` };
  }
}

export { serializeUser };

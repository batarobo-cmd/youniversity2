import { SignJWT, jwtVerify } from 'jose';
import { eq, and } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { users } from '../db/schema';
import { createSession } from './session';
import { recordLogin } from './login-events';
import {
  type CorporateProfile,
  extractEmailDomain,
  composeDisplayName,
  mergeOAuthProfile,
  isFirstProfileSync,
} from './user-profile';
import { serializeUser } from './user-serializer';
import {
  isEmailDomainAllowed,
  isOAuthProviderActive,
  resolveOAuthProvider,
  getAuthSettings,
} from './auth-settings';

export type OAuthProvider = 'google' | 'microsoft';

const secret = new TextEncoder().encode(config.jwtSecret);

const GOOGLE_OAUTH_SCOPES = 'openid email profile';

const MICROSOFT_OAUTH_SCOPES = 'openid profile email User.Read';

function redirectUri(provider: OAuthProvider) {
  return `${config.oauth.apiUrl}/api/auth/oauth/${provider}/callback`;
}

function mapLocaleFromOAuth(value?: string): string | undefined {
  if (!value) return undefined;
  const base = value.split(/[-_]/)[0]?.toLowerCase();
  return base || undefined;
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

function basicProfileFromIdentity(input: {
  email: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  avatarUrl?: string;
  preferredLocale?: string;
}): CorporateProfile {
  return {
    email: input.email,
    displayName: input.displayName,
    givenName: input.givenName,
    familyName: input.familyName,
    avatarUrl: input.avatarUrl,
    preferredLocale: input.preferredLocale,
  };
}

export async function getAuthorizationUrl(provider: OAuthProvider): Promise<string | null> {
  const resolved = await resolveOAuthProvider(provider);
  if (!resolved.enabled || !resolved.configured) return null;

  const state = await createState(provider);

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: resolved.clientId,
      redirect_uri: redirectUri('google'),
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPES,
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const tenant = resolved.tenantId;
  const params = new URLSearchParams({
    client_id: resolved.clientId,
    redirect_uri: redirectUri('microsoft'),
    response_type: 'code',
    scope: MICROSOFT_OAUTH_SCOPES,
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeGoogleCode(code: string): Promise<CorporateProfile & { oauthId: string }> {
  const resolved = await resolveOAuthProvider('google');
  if (!resolved.configured) throw new Error('Google OAuth not configured');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: resolved.clientId,
      client_secret: resolved.clientSecret,
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
  const profile = (await profileRes.json()) as {
    id: string;
    email: string;
    name: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    locale?: string;
  };

  return {
    ...basicProfileFromIdentity({
      email: profile.email,
      displayName: profile.name,
      givenName: profile.given_name,
      familyName: profile.family_name,
      avatarUrl: profile.picture,
      preferredLocale: mapLocaleFromOAuth(profile.locale),
    }),
    oauthId: profile.id,
  };
}

async function exchangeMicrosoftCode(code: string): Promise<CorporateProfile & { oauthId: string }> {
  const resolved = await resolveOAuthProvider('microsoft');
  if (!resolved.configured) throw new Error('Microsoft OAuth not configured');

  const tenant = resolved.tenantId;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: resolved.clientId,
      client_secret: resolved.clientSecret,
      redirect_uri: redirectUri('microsoft'),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) throw new Error('Microsoft token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,preferredLanguage',
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
  );

  if (!profileRes.ok) throw new Error('Microsoft profile fetch failed');
  const profile = (await profileRes.json()) as {
    id: string;
    displayName?: string;
    givenName?: string;
    surname?: string;
    mail?: string;
    userPrincipalName?: string;
    preferredLanguage?: string;
  };

  const email = profile.mail ?? profile.userPrincipalName;
  if (!email) throw new Error('Microsoft profile missing email');

  return {
    ...basicProfileFromIdentity({
      email,
      displayName: profile.displayName ?? email,
      givenName: profile.givenName,
      familyName: profile.surname,
      preferredLocale: mapLocaleFromOAuth(profile.preferredLanguage),
    }),
    oauthId: profile.id,
  };
}

async function findOrCreateOAuthUser(provider: OAuthProvider, profile: CorporateProfile, oauthId: string) {
  const [byOAuth] = await db
    .select()
    .from(users)
    .where(and(eq(users.oauthProvider, provider), eq(users.oauthId, oauthId)))
    .limit(1);

  if (byOAuth) {
    const updates = mergeOAuthProfile(byOAuth, profile, isFirstProfileSync(byOAuth));
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, byOAuth.id))
      .returning();
    return updated;
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);

  if (byEmail) {
    const updates = {
      ...mergeOAuthProfile(byEmail, profile, isFirstProfileSync(byEmail)),
      oauthProvider: provider,
      oauthId,
    };
    const [linked] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, byEmail.id))
      .returning();
    return linked;
  }

  const merged = mergeOAuthProfile(null, profile, true);
  const [created] = await db
    .insert(users)
    .values({
      email: profile.email,
      oauthProvider: provider,
      oauthId,
      role: 'student',
      companyDomain: extractEmailDomain(profile.email),
      ...merged,
      name:
        merged.name ??
        (profile.displayName ||
          composeDisplayName(profile.givenName, profile.familyName, profile.email)),
    })
    .returning();

  return created;
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
    if (!(await isOAuthProviderActive(provider))) {
      return { redirectUrl: `${config.oauth.webUrl}/login?error=oauth_disabled` };
    }

    const exchanged =
      provider === 'google' ? await exchangeGoogleCode(code) : await exchangeMicrosoftCode(code);
    const { oauthId, ...profile } = exchanged;

    const settings = await getAuthSettings();
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);
    const domainList = existingUser
      ? settings.allowedLoginDomains
      : settings.allowedRegistrationDomains;
    if (!isEmailDomainAllowed(profile.email, domainList)) {
      return { redirectUrl: `${config.oauth.webUrl}/login?error=domain_not_allowed` };
    }

    const user = await findOrCreateOAuthUser(provider, profile, oauthId);
    if (user.isSuspended) {
      return { redirectUrl: `${config.oauth.webUrl}/login?error=account_suspended` };
    }
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

export { serializeUser } from './user-serializer';

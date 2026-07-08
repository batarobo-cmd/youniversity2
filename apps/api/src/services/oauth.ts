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
  corporateProfileToDbFields,
} from './user-profile';
import { serializeUser } from './user-serializer';
import {
  getPublicAuthConfig,
  isEmailDomainAllowed,
  isOAuthProviderActive,
  resolveOAuthProvider,
  getAuthSettings,
} from './auth-settings';

export type OAuthProvider = 'google' | 'microsoft';

interface OAuthIdentity {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

const secret = new TextEncoder().encode(config.jwtSecret);

const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/user.organization.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read',
].join(' ');

const MICROSOFT_OAUTH_SCOPES = 'openid profile email User.Read';

export async function getEnabledProviders() {
  const publicConfig = await getPublicAuthConfig();
  return publicConfig.oauth;
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

function mapLocaleFromMicrosoft(value?: string): string | undefined {
  if (!value) return undefined;
  const base = value.split('-')[0]?.toLowerCase();
  return base || undefined;
}

function pickGoogleOrganization(
  organizations?: Array<{
    name?: string;
    title?: string;
    department?: string;
    location?: string;
    domain?: string;
    current?: boolean;
    primary?: boolean;
  }>,
) {
  if (!organizations?.length) return undefined;
  return (
    organizations.find((o) => o.current) ??
    organizations.find((o) => o.primary) ??
    organizations[0]
  );
}

function pickGooglePhone(
  phoneNumbers?: Array<{ value?: string; type?: string; canonicalForm?: string }>,
  ...types: string[]
) {
  if (!phoneNumbers?.length) return undefined;
  const normalized = types.map((t) => t.toLowerCase());
  const match = phoneNumbers.find((p) => p.type && normalized.includes(p.type.toLowerCase()));
  return match?.value ?? match?.canonicalForm ?? phoneNumbers[0]?.value ?? phoneNumbers[0]?.canonicalForm;
}

function pickGoogleEmployeeId(
  externalIds?: Array<{ value?: string; type?: string }>,
) {
  if (!externalIds?.length) return undefined;
  const orgId = externalIds.find((e) => e.type?.toLowerCase() === 'organization');
  return orgId?.value ?? externalIds[0]?.value;
}

async function fetchGoogleCorporateProfile(
  accessToken: string,
  identity: OAuthIdentity,
): Promise<CorporateProfile> {
  const base: CorporateProfile = {
    email: identity.email,
    displayName: identity.name,
    avatarUrl: identity.avatarUrl,
  };

  try {
    const params = new URLSearchParams({
      personFields: 'names,organizations,phoneNumbers,externalIds,addresses,photos',
    });
    const res = await fetch(`https://people.googleapis.com/v1/people/me?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return base;

    const data = (await res.json()) as {
      names?: Array<{ givenName?: string; familyName?: string; displayName?: string }>;
      organizations?: Array<{
        name?: string;
        title?: string;
        department?: string;
        location?: string;
        domain?: string;
        current?: boolean;
        primary?: boolean;
      }>;
      phoneNumbers?: Array<{ value?: string; type?: string; canonicalForm?: string }>;
      externalIds?: Array<{ value?: string; type?: string }>;
      addresses?: Array<{ city?: string; country?: string; type?: string }>;
      photos?: Array<{ url?: string }>;
    };

    const name = data.names?.[0];
    const org = pickGoogleOrganization(data.organizations);
    const workAddress = data.addresses?.find((a) => a.type?.toLowerCase() === 'work') ?? data.addresses?.[0];

    return {
      email: identity.email,
      displayName: name?.displayName ?? identity.name,
      givenName: name?.givenName,
      familyName: name?.familyName,
      jobTitle: org?.title,
      department: org?.department,
      employeeId: pickGoogleEmployeeId(data.externalIds),
      companyName: org?.name,
      officeLocation: org?.location,
      mobilePhone: pickGooglePhone(data.phoneNumbers, 'mobile', 'main'),
      businessPhone: pickGooglePhone(data.phoneNumbers, 'work'),
      city: workAddress?.city,
      country: workAddress?.country,
      avatarUrl: data.photos?.[0]?.url ?? identity.avatarUrl,
    };
  } catch {
    return base;
  }
}

async function fetchMicrosoftCorporateProfile(
  accessToken: string,
  identity: OAuthIdentity,
): Promise<CorporateProfile> {
  const select = [
    'displayName',
    'givenName',
    'surname',
    'mail',
    'userPrincipalName',
    'jobTitle',
    'department',
    'employeeId',
    'companyName',
    'officeLocation',
    'mobilePhone',
    'businessPhones',
    'city',
    'country',
    'preferredLanguage',
  ].join(',');

  const res = await fetch(`https://graph.microsoft.com/v1.0/me?$select=${select}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return {
      email: identity.email,
      displayName: identity.name,
      avatarUrl: identity.avatarUrl,
    };
  }

  const data = (await res.json()) as {
    displayName?: string;
    givenName?: string;
    surname?: string;
    mail?: string;
    userPrincipalName?: string;
    jobTitle?: string;
    department?: string;
    employeeId?: string;
    companyName?: string;
    officeLocation?: string;
    mobilePhone?: string;
    businessPhones?: string[];
    city?: string;
    country?: string;
    preferredLanguage?: string;
  };

  const email = data.mail ?? data.userPrincipalName ?? identity.email;

  return {
    email,
    displayName: data.displayName ?? identity.name,
    givenName: data.givenName,
    familyName: data.surname,
    jobTitle: data.jobTitle,
    department: data.department,
    employeeId: data.employeeId,
    companyName: data.companyName,
    officeLocation: data.officeLocation,
    mobilePhone: data.mobilePhone,
    businessPhone: data.businessPhones?.[0],
    city: data.city,
    country: data.country,
    preferredLocale: mapLocaleFromMicrosoft(data.preferredLanguage),
    avatarUrl: identity.avatarUrl,
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
  const profile = (await profileRes.json()) as { id: string; email: string; name: string; picture?: string };

  const identity: OAuthIdentity = {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture,
  };

  const corporate = await fetchGoogleCorporateProfile(tokens.access_token, identity);
  return { ...corporate, oauthId: profile.id };
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

  const idRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!idRes.ok) throw new Error('Microsoft profile fetch failed');
  const idProfile = (await idRes.json()) as {
    id: string;
    mail?: string;
    userPrincipalName: string;
    displayName: string;
  };

  const identity: OAuthIdentity = {
    id: idProfile.id,
    email: idProfile.mail ?? idProfile.userPrincipalName,
    name: idProfile.displayName,
  };

  const corporate = await fetchMicrosoftCorporateProfile(tokens.access_token, identity);
  return { ...corporate, oauthId: idProfile.id };
}

async function findOrCreateOAuthUser(provider: OAuthProvider, profile: CorporateProfile, oauthId: string) {
  const [byOAuth] = await db
    .select()
    .from(users)
    .where(and(eq(users.oauthProvider, provider), eq(users.oauthId, oauthId)))
    .limit(1);

  if (byOAuth) {
    const firstSync = isFirstProfileSync(byOAuth);
    const updates = mergeOAuthProfile(byOAuth, profile, firstSync);
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, byOAuth.id))
      .returning();
    return updated;
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);

  if (byEmail) {
    const firstSync = isFirstProfileSync(byEmail);
    const updates = {
      ...mergeOAuthProfile(byEmail, profile, firstSync),
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

  const [created] = await db
    .insert(users)
    .values({
      email: profile.email,
      oauthProvider: provider,
      oauthId,
      role: 'student',
      companyDomain: extractEmailDomain(profile.email),
      ...corporateProfileToDbFields(profile),
      profileSyncedAt: new Date(),
      name: profile.displayName || composeDisplayName(profile.givenName, profile.familyName, profile.email),
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

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { createSession, destroySession, touchSession } from '../services/session';
import { recordLogin } from '../services/login-events';
import { recordUserActivity } from '../services/activity-log';
import { SUSPENDED_ACCOUNT_CODE } from '../services/user-suspension';
import {
  getPublicAuthConfig,
  getAuthSettings,
  isEmailDomainAllowed,
} from '../services/auth-settings';
import { resolveLoginIdentifier, useLocalDevCredentials } from '../services/demo-users';
import { SUPPORTED_LOCALES, composePersonDisplayName, normalizePersonName, isSafePersonName } from '@youniversity2/shared';
import {
  getAuthorizationUrl,
  handleOAuthCallback,
  serializeUser,
  type OAuthProvider,
} from '../services/oauth';
import { verifyTurnstileToken } from '../services/turnstile';
import { clientIpFromHeaders, consumeRateLimit } from '../services/rate-limit';

const personNameField = z
  .string()
  .min(1)
  .max(100)
  .transform(normalizePersonName)
  .refine(isSafePersonName, { message: 'Invalid name' });

const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  givenName: personNameField,
  familyName: personNameField,
  preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
  turnstileToken: z.string().max(2048).optional(),
  /** Honeypot — must stay empty. */
  companyWebsite: z.string().max(0).optional(),
});

const loginSchema = useLocalDevCredentials()
  ? z.object({
      email: z.string().min(1),
      password: z.string(),
    })
  : z.object({
      email: z.string().email(),
      password: z.string(),
    });

export const authRoutes = new Hono();

authRoutes.get('/config', async (c) => {
  return c.json(await getPublicAuthConfig());
});

authRoutes.get('/oauth/providers', async (c) => {
  const publicConfig = await getPublicAuthConfig();
  return c.json({
    google: publicConfig.oauth.google.enabled,
    microsoft: publicConfig.oauth.microsoft.enabled,
  });
});

authRoutes.get('/oauth/:provider', async (c) => {
  const provider = c.req.param('provider') as OAuthProvider;
  if (provider !== 'google' && provider !== 'microsoft') {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  const url = await getAuthorizationUrl(provider);
  if (!url) {
    return c.json({ error: 'OAuth provider not configured' }, 503);
  }

  return c.redirect(url);
});

authRoutes.get('/oauth/:provider/callback', async (c) => {
  const provider = c.req.param('provider') as OAuthProvider;
  if (provider !== 'google' && provider !== 'microsoft') {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error || !code || !state) {
    return c.redirect(`${process.env.WEB_URL ?? 'http://localhost:5173'}/login?error=oauth_denied`);
  }

  const { redirectUrl } = await handleOAuthCallback(provider, code, state);
  return c.redirect(redirectUrl);
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user') as AuthUser;
  const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(serializeUser(user));
});

authRoutes.post('/heartbeat', async (c) => {
  const header = c.req.header('Authorization');
  const sessionId = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const tabId = c.req.header('X-Tab-Session') ?? null;
  const user = await touchSession(sessionId, { isHeartbeat: true, tabId });
  if (!user) {
    return c.json({ error: 'Session expired' }, 401);
  }
  const [row] = await db
    .select({
      isSuspended: users.isSuspended,
      role: users.role,
      systemAdminPasswordHash: users.systemAdminPasswordHash,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (row?.isSuspended) {
    await destroySession(sessionId);
    return c.json({ error: SUSPENDED_ACCOUNT_CODE, code: SUSPENDED_ACCOUNT_CODE }, 403);
  }
  return c.json({
    ok: true,
    needsSystemAdminPassword:
      row?.role === 'system_admin' && !row.systemAdminPasswordHash,
  });
});

authRoutes.post('/system-admin-password', authMiddleware, async (c) => {
  const authUser = c.get('user') as AuthUser;
  const body = z
    .object({
      password: z.string().min(8),
      confirmPassword: z.string().min(8),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
  if (body.data.password !== body.data.confirmPassword) {
    return c.json({ error: 'Protection passwords do not match' }, 400);
  }

  const [existing] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!existing) return c.json({ error: 'User not found' }, 404);
  if (existing.role !== 'system_admin') {
    return c.json({ error: 'Only system administrators can set this password' }, 403);
  }

  const systemAdminPasswordHash = await bcrypt.hash(body.data.password, 12);
  const [updated] = await db
    .update(users)
    .set({ systemAdminPasswordHash, updatedAt: new Date() })
    .where(eq(users.id, authUser.id))
    .returning();

  void recordUserActivity(authUser.id, 'user.system_admin_password_set');
  return c.json(serializeUser(updated));
});

authRoutes.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user') as AuthUser;
  const sessionId = c.get('sessionId') as string | undefined;
  if (sessionId) {
    await destroySession(sessionId);
  }
  void recordUserActivity(user.id, 'auth.logout');
  return c.json({ ok: true });
});

authRoutes.post('/register', async (c) => {
  const settings = await getAuthSettings();
  if (!settings.manualRegistrationEnabled) {
    return c.json({ error: 'Registration is disabled', code: 'registration_disabled' }, 403);
  }

  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
  }

  if (body.data.companyWebsite) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const clientIp = clientIpFromHeaders(
    c.req.header('X-Forwarded-For'),
    c.req.header('X-Real-IP'),
  );
  const rateKey = `register:${clientIp ?? 'unknown'}`;
  if (!(await consumeRateLimit(rateKey, 5, 3600))) {
    return c.json({ error: 'Too many registration attempts', code: 'rate_limited' }, 429);
  }

  const captcha = await verifyTurnstileToken(body.data.turnstileToken, clientIp);
  if (!captcha.ok) {
    return c.json({ error: 'Captcha verification failed', code: captcha.code }, 403);
  }

  const { email, password, givenName, familyName, preferredLocale } = body.data;
  const name = composePersonDisplayName(givenName, familyName);

  if (!isEmailDomainAllowed(email, settings.allowedRegistrationDomains)) {
    return c.json({ error: 'Email domain is not allowed', code: 'domain_not_allowed' }, 403);
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      givenName,
      familyName,
      companyDomain: email.includes('@') ? email.split('@')[1]?.toLowerCase() : undefined,
      preferredLocale: preferredLocale ?? 'sk',
      role: 'student',
    })
    .returning();

  const authUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  const sessionId = await createSession(authUser);
  try {
    await recordLogin(user.id, 'password');
  } catch (err) {
    console.warn('[auth] login event not recorded:', (err as Error).message);
  }

  return c.json({ sessionId, accessToken: sessionId, user: serializeUser(user) }, 201);
});

authRoutes.post('/login', async (c) => {
  const settings = await getAuthSettings();
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const email = resolveLoginIdentifier(body.data.email);
  const { password } = body.data;

  if (!isEmailDomainAllowed(email, settings.allowedLoginDomains)) {
    return c.json({ error: 'Email domain is not allowed', code: 'domain_not_allowed' }, 403);
  }
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (!user.passwordHash) {
    const provider = user.oauthProvider === 'google' ? 'Google' : 'Microsoft 365';
    return c.json({ error: `Použite prihlásenie cez ${provider}` }, 401);
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (user.isSuspended) {
    return c.json({ error: SUSPENDED_ACCOUNT_CODE, code: SUSPENDED_ACCOUNT_CODE }, 403);
  }

  const authUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  const sessionId = await createSession(authUser);
  try {
    await recordLogin(user.id, 'password');
  } catch (err) {
    console.warn('[auth] login event not recorded:', (err as Error).message);
  }

  return c.json({ sessionId, accessToken: sessionId, user: serializeUser(user) });
});

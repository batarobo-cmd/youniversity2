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
import { SUPPORTED_LOCALES } from '@youniversity2/shared';
import {
  getAuthorizationUrl,
  handleOAuthCallback,
  serializeUser,
  type OAuthProvider,
} from '../services/oauth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
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
    .select({ isSuspended: users.isSuspended })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (row?.isSuspended) {
    await destroySession(sessionId);
    return c.json({ error: SUSPENDED_ACCOUNT_CODE, code: SUSPENDED_ACCOUNT_CODE }, 403);
  }
  return c.json({ ok: true });
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

  const { email, password, name, preferredLocale } = body.data;

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

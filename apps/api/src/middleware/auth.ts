import { SignJWT, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import { config } from '../config';
import type { UserRole } from '@youniversity2/shared';
import { touchSession, getSessionUser, destroySession } from '../services/session';
import { isUserSuspended } from '../services/user-suspension';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

const secret = new TextEncoder().encode(config.jwtSecret);

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.email || !payload.role || !payload.name) return null;
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

function extractSessionId(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)yo2_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function extractTabId(c: Context): string | null {
  return c.req.header('X-Tab-Session') ?? null;
}

async function rejectSuspendedUser(user: AuthUser, sessionId: string | null): Promise<AuthUser | null> {
  if (await isUserSuspended(user.id)) {
    if (sessionId) await destroySession(sessionId);
    return null;
  }
  return user;
}

async function resolveUser(c: Context, isHeartbeat = false): Promise<AuthUser | null> {
  const sessionId = extractSessionId(c);
  if (!sessionId) return null;

  const tabId = extractTabId(c);
  const user = await touchSession(sessionId, { isHeartbeat, tabId });
  if (user) return rejectSuspendedUser(user, sessionId);

  // Spätná kompatibilita: staré JWT v cookie/localStorage
  const jwtUser = await verifyToken(sessionId);
  if (!jwtUser) return null;
  return rejectSuspendedUser(jwtUser, sessionId);
}

export async function authMiddleware(c: Context, next: Next) {
  const user = await resolveUser(c, false);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  c.set('sessionId', extractSessionId(c));
  await next();
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
}

export async function optionalAuth(c: Context, next: Next) {
  const user = await resolveUser(c, false);
  if (user) c.set('user', user);
  await next();
}

export async function resolveSessionFromToken(token: string, tabId?: string | null) {
  const user = await touchSession(token, { tabId });
  if (user) return rejectSuspendedUser(user, token);
  const jwtUser = await verifyToken(token);
  if (!jwtUser) return null;
  return rejectSuspendedUser(jwtUser, token);
}

export async function resolveWebSocketSession(token: string): Promise<AuthUser | null> {
  const user = await getSessionUser(token);
  if (user) {
    const active = await touchSession(token, { isHeartbeat: true });
    if (!active) return null;
    return rejectSuspendedUser(active, token);
  }
  const jwtUser = await verifyToken(token);
  if (!jwtUser) return null;
  return rejectSuspendedUser(jwtUser, token);
}

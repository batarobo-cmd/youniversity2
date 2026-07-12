import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import type { AuthUser } from '../middleware/auth';
import { db } from '../db';
import { users } from '../db/schema';

export interface SessionData {
  userId: string;
  email: string;
  role: AuthUser['role'];
  name: string;
  createdAt: number;
  lastActivityAt: number;
  lastHeartbeatAt: number;
  browserTabId: string | null;
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

function sessionKey(id: string) {
  return `session:${id}`;
}

function userSessionsKey(userId: string) {
  return `user_sessions:${userId}`;
}

function toAuthUser(s: SessionData): AuthUser {
  return { id: s.userId, email: s.email, role: s.role, name: s.name };
}

function redisTtlSeconds() {
  return Math.ceil(config.sessionIdleMs / 1000) + 300;
}

/** Keep cached session fields aligned with the database (role changes, profile edits). */
async function syncSessionWithDb(
  session: SessionData,
  sessionId: string,
  persist: boolean,
): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) {
    await destroySession(sessionId);
    return null;
  }

  session.email = row.email;
  session.name = row.name;
  session.role = row.role;

  if (persist) {
    await getRedis().setex(sessionKey(sessionId), redisTtlSeconds(), JSON.stringify(session));
  }

  return toAuthUser(session);
}

export async function createSession(user: AuthUser, tabId?: string | null): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  const data: SessionData = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    createdAt: now,
    lastActivityAt: now,
    lastHeartbeatAt: now,
    browserTabId: tabId ?? null,
  };
  const r = getRedis();
  await r.setex(sessionKey(id), redisTtlSeconds(), JSON.stringify(data));
  await r.sadd(userSessionsKey(user.id), id);
  return id;
}

export interface TouchOptions {
  isHeartbeat?: boolean;
  tabId?: string | null;
}

export async function touchSession(
  sessionId: string,
  options: TouchOptions = {},
): Promise<AuthUser | null> {
  const r = getRedis();
  const raw = await r.get(sessionKey(sessionId));
  if (!raw) return null;

  const session: SessionData = JSON.parse(raw);
  const now = Date.now();

  if (now - session.lastActivityAt > config.sessionIdleMs) {
    await destroySession(sessionId);
    return null;
  }

  if (now - session.lastHeartbeatAt > config.sessionBrowserClosedMs) {
    await destroySession(sessionId);
    return null;
  }

  if (options.isHeartbeat) {
    session.lastHeartbeatAt = now;
  } else {
    session.lastActivityAt = now;
    session.lastHeartbeatAt = now;
  }

  if (options.tabId) {
    session.browserTabId = options.tabId;
  }

  return syncSessionWithDb(session, sessionId, true);
}

export async function getSessionUser(sessionId: string): Promise<AuthUser | null> {
  const raw = await getRedis().get(sessionKey(sessionId));
  if (!raw) return null;
  const session = JSON.parse(raw) as SessionData;
  return syncSessionWithDb(session, sessionId, true);
}

export async function destroySession(sessionId: string): Promise<void> {
  const r = getRedis();
  const raw = await r.get(sessionKey(sessionId));
  if (raw) {
    const session = JSON.parse(raw) as SessionData;
    await r.srem(userSessionsKey(session.userId), sessionId);
  }
  await r.del(sessionKey(sessionId));
}

export async function updateSessionRoleForUser(
  userId: string,
  role: AuthUser['role'],
): Promise<void> {
  const r = getRedis();
  const sessionIds = await r.smembers(userSessionsKey(userId));
  for (const sessionId of sessionIds) {
    const raw = await r.get(sessionKey(sessionId));
    if (!raw) {
      await r.srem(userSessionsKey(userId), sessionId);
      continue;
    }
    const session = JSON.parse(raw) as SessionData;
    session.role = role;
    await r.setex(sessionKey(sessionId), redisTtlSeconds(), JSON.stringify(session));
  }
}

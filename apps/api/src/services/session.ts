import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../config';
import type { AuthUser } from '../middleware/auth';

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

function toAuthUser(s: SessionData): AuthUser {
  return { id: s.userId, email: s.email, role: s.role, name: s.name };
}

function redisTtlSeconds() {
  return Math.ceil(config.sessionIdleMs / 1000) + 300;
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
  await getRedis().setex(sessionKey(id), redisTtlSeconds(), JSON.stringify(data));
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

  await r.setex(sessionKey(sessionId), redisTtlSeconds(), JSON.stringify(session));
  return toAuthUser(session);
}

export async function getSessionUser(sessionId: string): Promise<AuthUser | null> {
  const raw = await getRedis().get(sessionKey(sessionId));
  if (!raw) return null;
  return toAuthUser(JSON.parse(raw) as SessionData);
}

export async function destroySession(sessionId: string): Promise<void> {
  await getRedis().del(sessionKey(sessionId));
}

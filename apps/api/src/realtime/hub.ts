import type { ServerWebSocket } from 'bun';
import Redis from 'ioredis';
import { WS_EVENTS, type WsMessage } from '@youniversity2/shared';
import { config } from '../config';
import { resolveWebSocketSession, type AuthUser } from '../middleware/auth';
import { db } from '../db';
import { activityEvents } from '../db/schema';

interface WsData {
  user: AuthUser;
  rooms: Set<string>;
}

type AppSocket = ServerWebSocket<WsData>;

const localConnections = new Map<string, Set<AppSocket>>();
let redis: Redis | null = null;
let redisSub: Redis | null = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

function getRedisSub() {
  if (!redisSub) {
    redisSub = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redisSub;
}

export async function initRealtimeHub() {
  try {
    const sub = getRedisSub();
    await sub.connect();
    await sub.subscribe('youniversity2:broadcast');

    sub.on('message', (_channel, message) => {
      const parsed = JSON.parse(message) as { room: string; message: WsMessage };
      broadcastLocal(parsed.room, parsed.message);
    });
  } catch (err) {
    console.warn('[realtime] Redis unavailable, using local-only mode:', (err as Error).message);
  }
}

function roomKey(room: string) {
  return room;
}

function addToRoom(room: string, ws: AppSocket) {
  const key = roomKey(room);
  if (!localConnections.has(key)) localConnections.set(key, new Set());
  localConnections.get(key)!.add(ws);
  ws.data.rooms.add(key);
}

function removeFromRoom(room: string, ws: AppSocket) {
  const key = roomKey(room);
  localConnections.get(key)?.delete(ws);
  ws.data.rooms.delete(key);
}

function broadcastLocal(room: string, message: WsMessage) {
  const connections = localConnections.get(roomKey(room));
  if (!connections) return;

  const data = JSON.stringify(message);
  for (const ws of connections) {
    try {
      ws.send(data);
    } catch {
      connections.delete(ws);
    }
  }
}

async function publish(room: string, message: WsMessage) {
  broadcastLocal(room, message);

  try {
    const r = getRedis();
    if (r.status !== 'ready') await r.connect();
    await r.publish('youniversity2:broadcast', JSON.stringify({ room, message }));
  } catch {
    // local-only fallback
  }
}

export function broadcastToCourse(courseId: string, message: WsMessage) {
  publish(`course:${courseId}`, message);
  publish('admin:global', message);
}

export function broadcastToUser(userId: string, message: WsMessage) {
  publish(`user:${userId}`, message);
}

export function createWebSocketHandlers() {
  return {
    async open(ws: AppSocket) {
      const token = ws.data.user;
      addToRoom(`user:${token.id}`, ws);

      if (token.role === 'admin' || token.role === 'instructor') {
        addToRoom('admin:global', ws);
      }
    },

    async message(ws: AppSocket, raw: string | Buffer) {
      const user = ws.data.user;
      let msg: WsMessage;

      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
        return;
      }

      switch (msg.type) {
        case WS_EVENTS.JOIN_COURSE: {
          const { courseId } = msg.payload as { courseId: string };
          addToRoom(`course:${courseId}`, ws);

          broadcastToCourse(courseId, {
            type: WS_EVENTS.PRESENCE,
            payload: { userId: user.id, userName: user.name, courseId, online: true },
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case WS_EVENTS.LEAVE_ROOM: {
          const { room } = msg.payload as { room: string };
          removeFromRoom(room, ws);
          break;
        }

        case WS_EVENTS.ACTIVITY: {
          const payload = msg.payload as {
            eventType: string;
            courseId?: string;
            lessonId?: string;
            data?: Record<string, unknown>;
          };

          const [event] = await db
            .insert(activityEvents)
            .values({
              userId: user.id,
              courseId: payload.courseId,
              lessonId: payload.lessonId,
              eventType: payload.eventType,
              payload: payload.data ?? {},
            })
            .returning();

          if (payload.courseId) {
            broadcastToCourse(payload.courseId, {
              type: WS_EVENTS.ACTIVITY_BROADCAST,
              payload: {
                event: {
                  id: event.id,
                  userId: event.userId,
                  courseId: event.courseId ?? undefined,
                  lessonId: event.lessonId ?? undefined,
                  eventType: event.eventType,
                  payload: event.payload as Record<string, unknown>,
                  createdAt: event.createdAt.toISOString(),
                },
                userName: user.name,
              },
              timestamp: new Date().toISOString(),
            });
          }
          break;
        }
      }
    },

    close(ws: AppSocket) {
      for (const room of [...ws.data.rooms]) {
        removeFromRoom(room, ws);
      }
    },
  };
}

export async function authenticateWebSocket(request: Request): Promise<AuthUser | null> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return null;
  return resolveWebSocketSession(token);
}

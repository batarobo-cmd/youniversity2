import { writable } from 'svelte/store';
import { WS_EVENTS, type WsMessage } from '@youniversity2/shared';
import { get } from 'svelte/store';
import { token } from './auth';
import { api } from '../api';
import { HEARTBEAT_INTERVAL_MS } from '../session';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export const wsStatus = writable<ConnectionStatus>('disconnected');
export const lastMessage = writable<WsMessage | null>(null);
export const activityFeed = writable<Array<{ userName: string; eventType: string; time: string }>>([]);

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectToken: string | null = null;

export function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!get(token)) return;
    try {
      await api.heartbeat();
    } catch {
      // Relácia vypršala — layout server redirect pri ďalšom requeste
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function connectWebSocket(sessionToken?: string) {
  const t = sessionToken ?? get(token) ?? reconnectToken;
  if (!t || socket?.readyState === WebSocket.OPEN) return;
  reconnectToken = t;

  wsStatus.set('connecting');

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? 'localhost:3001' : window.location.host;
  socket = new WebSocket(`${protocol}//${host}/ws?token=${t}`);

  socket.onopen = () => {
    wsStatus.set('connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WsMessage;
    lastMessage.set(msg);

    if (msg.type === WS_EVENTS.ACTIVITY_BROADCAST) {
      const payload = msg.payload as { userName: string; event: { eventType: string } };
      activityFeed.update((feed) => [
        {
          userName: payload.userName,
          eventType: payload.event.eventType,
          time: new Date(msg.timestamp).toLocaleTimeString(),
        },
        ...feed.slice(0, 99),
      ]);
    }
  };

  socket.onclose = () => {
    wsStatus.set('disconnected');
    socket = null;
    reconnectTimer = setTimeout(() => connectWebSocket(reconnectToken ?? undefined), 3000);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function disconnectWebSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
  reconnectToken = null;
  wsStatus.set('disconnected');
}

export function sendWsMessage(message: WsMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function joinCourse(courseId: string) {
  sendWsMessage({
    type: WS_EVENTS.JOIN_COURSE,
    payload: { courseId },
    timestamp: new Date().toISOString(),
  });
}

export function trackActivity(
  eventType: string,
  courseId?: string,
  lessonId?: string,
  data?: Record<string, unknown>,
) {
  if (get(token)) {
    void api
      .trackActivity({
        eventType,
        courseId,
        lessonId,
        payload: data,
      })
      .catch(() => {});
  }

  if (courseId) {
    sendWsMessage({
      type: WS_EVENTS.ACTIVITY,
      payload: { eventType, courseId, lessonId, data },
      timestamp: new Date().toISOString(),
    });
  }
}

import { lastMessage } from '$lib/stores/realtime';
import { WS_EVENTS, type WsMessage } from '@youniversity2/shared';

const DASHBOARD_REFRESH_EVENTS = new Set<string>([
  WS_EVENTS.ENROLLMENT_CHANGED,
  WS_EVENTS.COURSE_UPDATED,
  WS_EVENTS.PROGRESS_UPDATED,
  WS_EVENTS.COMPLETION_EVALUATED,
]);

function payloadUserId(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.userId === 'string') return payload.userId;
  const enrollment = payload.enrollment as { userId?: string } | undefined;
  return enrollment?.userId;
}

export function shouldRefreshDashboard(msg: WsMessage | null, userId?: string | null): boolean {
  if (!msg || !DASHBOARD_REFRESH_EVENTS.has(msg.type)) return false;
  if (msg.type === WS_EVENTS.COURSE_UPDATED) return true;

  const payload = msg.payload as Record<string, unknown> | undefined;
  const targetUserId = payloadUserId(payload);
  if (!userId || !targetUserId) return true;
  return targetUserId === userId;
}

export function isDashboardRefreshEvent(msg: WsMessage | null): boolean {
  return msg !== null && DASHBOARD_REFRESH_EVENTS.has(msg.type);
}

/** Počúva WebSocket a volá callback pri udalostiach ovplyvňujúcich dashboard. */
export function subscribeDashboardRefresh(
  onRefresh: () => void,
  getUserId?: () => string | null | undefined,
): () => void {
  return lastMessage.subscribe((msg) => {
    if (shouldRefreshDashboard(msg, getUserId?.())) onRefresh();
  });
}

import { lastMessage } from '$lib/stores/realtime';
import { WS_EVENTS, type WsMessage } from '@youniversity2/shared';

const DASHBOARD_REFRESH_EVENTS = new Set<string>([
  WS_EVENTS.ENROLLMENT_CHANGED,
  WS_EVENTS.COURSE_UPDATED,
  WS_EVENTS.PROGRESS_UPDATED,
  WS_EVENTS.COMPLETION_EVALUATED,
]);

export function isDashboardRefreshEvent(msg: WsMessage | null): boolean {
  return msg !== null && DASHBOARD_REFRESH_EVENTS.has(msg.type);
}

/** Počúva WebSocket a volá callback pri udalostiach ovplyvňujúcich dashboard. */
export function subscribeDashboardRefresh(onRefresh: () => void): () => void {
  return lastMessage.subscribe((msg) => {
    if (isDashboardRefreshEvent(msg)) onRefresh();
  });
}

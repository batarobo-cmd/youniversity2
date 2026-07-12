import { lastMessage } from '$lib/stores/realtime';
import { WS_EVENTS, type WsMessage } from '@youniversity2/shared';

const USERS_TABLE_REFRESH_EVENTS = new Set<string>([
  WS_EVENTS.USERS_UPDATED,
  WS_EVENTS.ENROLLMENT_CHANGED,
]);

export function shouldRefreshUsersTable(msg: WsMessage | null): boolean {
  return msg !== null && USERS_TABLE_REFRESH_EVENTS.has(msg.type);
}

/** Počúva WebSocket a volá callback pri zmenách ovplyvňujúcich tabuľku používateľov. */
export function subscribeUsersTableRefresh(onRefresh: () => void): () => void {
  return lastMessage.subscribe((msg) => {
    if (shouldRefreshUsersTable(msg)) onRefresh();
  });
}

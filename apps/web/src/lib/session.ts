const TAB_KEY = 'yo2_tab_id';

/** ID prehliadačovej karty — sessionStorage (zmizne po zatvorení browsera). */
export function getTabSessionId(): string {
  if (typeof sessionStorage === 'undefined') return '';
  let id = sessionStorage.getItem(TAB_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(TAB_KEY, id);
  }
  return id;
}

export const SESSION_COOKIE = 'yo2_session';
export const SESSION_STORAGE_KEY = 'yo2_session';

/** Interval heartbeatu (5 min) — musí byť < 30 min browser-closed timeout */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

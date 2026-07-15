import { writable, derived, get } from 'svelte/store';
import type { User } from '@youniversity2/shared';
import { DEFAULT_LOCALE, STUDENT_VIEW_COOKIE, type Locale, isStaffRole, isPlatformAdminRole, isSystemAdminRole } from '@youniversity2/shared';
import { SESSION_STORAGE_KEY } from '../session';

const LOCALE_KEY = 'yo2_locale';
const STUDENT_VIEW_KEY = 'yo2_student_view';

/** V prehliadači vždy same-origin /api (nginx → web proxy → API). Na serveri len dev override. */
export const API_BASE =
  typeof window !== 'undefined' ? '' : (import.meta.env.VITE_API_URL ?? '');

export function isAdminUser(u: Pick<User, 'role'> | null | undefined): boolean {
  return isStaffRole(u?.role);
}

export function isPlatformAdminUser(u: Pick<User, 'role'> | null | undefined): boolean {
  return isPlatformAdminRole(u?.role);
}

export function isSystemAdminUser(u: Pick<User, 'role'> | null | undefined): boolean {
  return isSystemAdminRole(u?.role);
}

function loadSessionId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

function loadLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  return (localStorage.getItem(LOCALE_KEY) as Locale) ?? DEFAULT_LOCALE;
}

function loadStudentViewMode(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STUDENT_VIEW_KEY) === '1';
}

function writeStudentViewCookie(enabled: boolean) {
  if (typeof document === 'undefined') return;
  const base = `${STUDENT_VIEW_COOKIE}=; Path=/; SameSite=Lax`;
  const expired = 'Thu, 01 Jan 1970 00:00:00 GMT';
  if (enabled) {
    const maxAge = 60 * 60 * 24 * 30;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${STUDENT_VIEW_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } else {
    for (const suffix of ['; Max-Age=0', `; Expires=${expired}`]) {
      document.cookie = `${base}${suffix}`;
      document.cookie = `${base}${suffix}; Secure`;
    }
  }
}

export function ensureStudentViewCookie() {
  writeStudentViewCookie(get(studentViewMode));
}

/** Session ID (opaque token) — nie JWT */
export const token = writable<string | null>(null);
export const user = writable<User | null>(null);
export const locale = writable<Locale>(loadLocale());
export const studentViewMode = writable<boolean>(loadStudentViewMode());
export const authReady = writable(false);

export const isAuthenticated = derived(token, ($token) => $token !== null);
export const isAdmin = derived(user, ($user) => isAdminUser($user));
/** Plný administrátor platformy (správa používateľov, systémové nastavenia). */
export const isPlatformAdmin = derived(user, ($user) => isPlatformAdminUser($user));
export const isSystemAdmin = derived(user, ($user) => isSystemAdminUser($user));
export const isActingAsStudent = derived(
  [user, studentViewMode],
  ([$user, $mode]) => Boolean($mode && isAdminUser($user)),
);
export const showStaffNav = derived(
  [user, studentViewMode],
  ([$user, $mode]) => isAdminUser($user) && !$mode,
);

if (typeof window !== 'undefined') {
  const stored = loadSessionId();
  if (stored) {
    token.set(stored);
    authReady.set(true);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ensureStudentViewCookie();
    }
  });
}

export function setAuth(sessionId: string, authUser: User) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  token.set(sessionId);
  user.set(authUser);
  authReady.set(true);
  if (authUser.preferredLocale) {
    setLocale(authUser.preferredLocale as Locale);
  }
}

export function clearAuth() {
  const previousUser = get(user);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    // Odstráň starý JWT ak existuje
    localStorage.removeItem('yo2_token');
  }
  token.set(null);
  user.set(null);
  authReady.set(true);
  if (previousUser?.preferredLocale) {
    setLocale(previousUser.preferredLocale as Locale);
  }
}

export function setStudentViewMode(enabled: boolean) {
  if (typeof localStorage !== 'undefined') {
    if (enabled) localStorage.setItem(STUDENT_VIEW_KEY, '1');
    else localStorage.removeItem(STUDENT_VIEW_KEY);
  }
  writeStudentViewCookie(enabled);
  studentViewMode.set(enabled);
}

export function syncStudentViewFromServer(_enabled: boolean) {
  const localEnabled =
    typeof localStorage !== 'undefined' && localStorage.getItem(STUDENT_VIEW_KEY) === '1';
  setStudentViewMode(localEnabled);
}

export function setLocale(newLocale: Locale) {
  localStorage.setItem(LOCALE_KEY, newLocale);
  locale.set(newLocale);
}

export function syncSessionFromServer(sessionId: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  token.set(sessionId);
  authReady.set(true);
}

/** Spustí callback až keď je session token pripravený (po SSR sync). */
export function whenAuthReady(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;

  const attempt = () => {
    if (cancelled || !get(authReady) || !get(token)) return;
    run();
  };

  const unsub = authReady.subscribe(() => attempt());
  const unsubToken = token.subscribe(() => attempt());
  attempt();

  return () => {
    cancelled = true;
    unsub();
    unsubToken();
  };
}

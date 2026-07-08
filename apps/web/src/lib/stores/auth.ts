import { writable, derived, get } from 'svelte/store';
import type { User } from '@youniversity2/shared';
import { DEFAULT_LOCALE, type Locale } from '@youniversity2/shared';
import { SESSION_STORAGE_KEY } from '../session';

const LOCALE_KEY = 'yo2_locale';

/** API URL — v produkcii vždy same-origin /api cez nginx; v dev Vite proxy. */
export const API_BASE = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL ?? '');

export function isAdminUser(u: Pick<User, 'role'> | null | undefined): boolean {
  return u?.role === 'admin' || u?.role === 'instructor';
}

export function isPlatformAdminUser(u: Pick<User, 'role'> | null | undefined): boolean {
  return u?.role === 'admin';
}

function loadSessionId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

function loadLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  return (localStorage.getItem(LOCALE_KEY) as Locale) ?? DEFAULT_LOCALE;
}

/** Session ID (opaque token) — nie JWT */
export const token = writable<string | null>(null);
export const user = writable<User | null>(null);
export const locale = writable<Locale>(loadLocale());
export const authReady = writable(false);

export const isAuthenticated = derived(token, ($token) => $token !== null);
export const isAdmin = derived(user, ($user) => isAdminUser($user));
/** Plný administrátor platformy (správa používateľov, systémové nastavenia). */
export const isPlatformAdmin = derived(user, ($user) => isPlatformAdminUser($user));

if (typeof window !== 'undefined') {
  const stored = loadSessionId();
  if (stored) {
    token.set(stored);
    authReady.set(true);
  }
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
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    // Odstráň starý JWT ak existuje
    localStorage.removeItem('yo2_token');
  }
  token.set(null);
  user.set(null);
  authReady.set(true);
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

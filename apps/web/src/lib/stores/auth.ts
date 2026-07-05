import { writable, derived, get } from 'svelte/store';
import type { User } from '@youniversity2/shared';
import { DEFAULT_LOCALE, type Locale } from '@youniversity2/shared';
import { SESSION_STORAGE_KEY } from '../session';

const LOCALE_KEY = 'yo2_locale';

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
export const isAdmin = derived(user, ($user) => $user?.role === 'admin' || $user?.role === 'instructor');

if (typeof window !== 'undefined') {
  const stored = loadSessionId();
  if (stored) token.set(stored);
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

import { writable, derived } from 'svelte/store';
import type { User } from '@youniversity2/shared';
import { DEFAULT_LOCALE, type Locale } from '@youniversity2/shared';

const TOKEN_KEY = 'yo2_token';
const LOCALE_KEY = 'yo2_locale';

function loadToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function loadLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  return (localStorage.getItem(LOCALE_KEY) as Locale) ?? DEFAULT_LOCALE;
}

export const token = writable<string | null>(loadToken());
export const user = writable<User | null>(null);
export const locale = writable<Locale>(loadLocale());

export const isAuthenticated = derived(user, ($user) => $user !== null);
export const isAdmin = derived(user, ($user) => $user?.role === 'admin' || $user?.role === 'instructor');

export function setAuth(accessToken: string, authUser: User) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  token.set(accessToken);
  user.set(authUser);
  if (authUser.preferredLocale) {
    setLocale(authUser.preferredLocale as Locale);
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  token.set(null);
  user.set(null);
}

export function setLocale(newLocale: Locale) {
  localStorage.setItem(LOCALE_KEY, newLocale);
  locale.set(newLocale);
}

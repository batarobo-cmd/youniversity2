import { writable } from 'svelte/store';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'yo2_theme';

function loadThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export const themePreference = writable<ThemePreference>(loadThemePreference());

export function setThemePreference(preference: ThemePreference) {
  themePreference.set(preference);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_KEY, preference);
  }
  applyTheme(preference);
}

/** Call once in root layout — applies theme and listens for OS changes in system mode. */
export function initTheme(): () => void {
  const pref = loadThemePreference();
  themePreference.set(pref);
  applyTheme(pref);

  if (typeof window === 'undefined') return () => {};

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (loadThemePreference() === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

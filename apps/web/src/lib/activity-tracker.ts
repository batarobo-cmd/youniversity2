import { get } from 'svelte/store';
import { token, locale } from './stores/auth';
import { trackActivity } from './stores/realtime';
import { t } from './i18n';

const DEDUPE_MS = 700;
let lastKey = '';
let lastAt = 0;
let bound = false;

function dedupe(key: string) {
  const now = Date.now();
  if (key === lastKey && now - lastAt < DEDUPE_MS) return true;
  lastKey = key;
  lastAt = now;
  return false;
}

function pageTitleForPath(pathname: string, loc: string): string {
  if (pathname === '/dashboard') return t('nav.dashboard', loc);
  if (pathname === '/courses') return t('nav.courses', loc);
  if (pathname.startsWith('/dashboard/admin/users')) return t('admin.usersTitle', loc);
  if (pathname.startsWith('/dashboard/admin/manage')) return t('admin.manageTitle', loc);
  if (pathname.match(/^\/dashboard\/admin\/courses\/[^/]+/)) return t('admin.editCourse', loc);
  if (pathname.startsWith('/dashboard/admin')) return t('nav.administration', loc);
  if (pathname.match(/^\/courses\/[^/]+$/)) return t('admin.logEvent.course.page', loc);
  return pathname;
}

function clickLabel(el: HTMLElement): string | null {
  const explicit = el.getAttribute('data-track');
  if (explicit?.trim()) return explicit.trim();

  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  const title = el.getAttribute('title')?.trim();
  if (title) return title;

  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length >= 2 && text.length <= 120) return text;

  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      const url = new URL(el.href);
      if (url.pathname !== window.location.pathname) {
        return url.pathname;
      }
    } catch {
      /* ignore */
    }
  }

  const name = el.getAttribute('name')?.trim();
  if (name) return name;

  return null;
}

function interactiveTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;

  const el = target.closest(
    'a[href], button, [role="button"], input[type="submit"], input[type="button"], label[for]',
  ) as HTMLElement | null;

  if (!el) return null;
  if (el.closest('[data-no-track]')) return null;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;

  const tag = el.tagName;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (type === 'password' || type === 'file' || type === 'hidden') return null;
  }

  return el;
}

function logPageView(pathname: string) {
  if (!get(token)) return;
  const loc = get(locale);
  const pageTitle = pageTitleForPath(pathname, loc);
  const key = `page:${pathname}`;
  if (dedupe(key)) return;

  trackActivity('navigation.page', undefined, undefined, {
    path: pathname,
    pageTitle,
  });
}

function onDocumentClick(event: MouseEvent) {
  if (!get(token)) return;
  if (event.button !== 0) return;

  const el = interactiveTarget(event.target);
  if (!el) return;

  const label = clickLabel(el);
  if (!label) return;

  const path = window.location.pathname;
  const key = `click:${path}:${label}`;
  if (dedupe(key)) return;

  const payload: Record<string, unknown> = {
    label,
    path,
    tag: el.tagName.toLowerCase(),
  };

  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      payload.href = new URL(el.href).pathname;
    } catch {
      /* ignore */
    }
  }

  trackActivity('ui.click', undefined, undefined, payload);
}

function onDocumentSubmit(event: Event) {
  if (!get(token)) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.closest('[data-no-track]')) return;

  const path = window.location.pathname;
  const formId = form.id || form.getAttribute('name') || undefined;
  const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
  const label =
    (submitter && clickLabel(submitter)) ||
    form.getAttribute('aria-label')?.trim() ||
    formId ||
    t('admin.logEvent.ui.form_submit', get(locale));

  const key = `submit:${path}:${label}`;
  if (dedupe(key)) return;

  trackActivity('ui.form_submit', undefined, undefined, {
    label,
    path,
    formId,
  });
}

export function initActivityTracker() {
  if (typeof window === 'undefined' || bound) return;
  bound = true;

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('submit', onDocumentSubmit, true);
}

export function trackPageView(pathname: string) {
  logPageView(pathname);
}

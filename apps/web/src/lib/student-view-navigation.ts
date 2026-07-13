import { setStudentViewMode } from '$lib/stores/auth';

/** Cieľová URL po prepnutí dočasného študentského režimu (next = true). */
export function resolveStudentViewEnterUrl(path: string): string {
  if (path.startsWith('/dashboard/admin')) return '/dashboard';
  return path;
}

/** Cieľová URL po ukončení dočasného študentského režimu (next = false). */
export function resolveStudentViewExitUrl(path: string): string {
  if (path.startsWith('/courses/')) {
    const courseId = path.slice('/courses/'.length).split('/')[0];
    if (courseId) return `/dashboard/admin/manage/courses/${courseId}`;
  }
  if (path.startsWith('/courses')) return '/dashboard';
  return path;
}

/**
 * Prepne režim a vykoná plné načítanie stránky.
 * Client-side goto/invalidate pri prepínaní roly spôsobovalo race conditions a prázdny obsah.
 */
export function applyStudentViewToggle(next: boolean, path: string) {
  setStudentViewMode(next);
  const target = next ? resolveStudentViewEnterUrl(path) : resolveStudentViewExitUrl(path);

  if (target === path) {
    window.location.reload();
  } else {
    window.location.assign(target);
  }
}

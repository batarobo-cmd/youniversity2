import { get } from 'svelte/store';
import { token, locale } from './stores/auth';
import { getTabSessionId } from './session';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = get(token);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (t) {
    headers.Authorization = `Bearer ${t}`;
    const tabId = getTabSessionId();
    if (tabId) headers['X-Tab-Session'] = tabId;
  }
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: authHeaders(options.headers as Record<string, string>),
    });
  } catch {
    throw new Error('Nepodarilo sa spojiť so serverom. Spustite API (bun run dev) a Docker.');
  }

  if (res.status === 401) {
    throw new Error('Relácia vypršala. Prihláste sa znova.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? `Chyba ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  heartbeat: () => request<{ ok: boolean }>('/api/auth/heartbeat', { method: 'POST' }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getDashboard: () => {
    const loc = get(locale);
    return request<Record<string, unknown>>(`/api/dashboard?locale=${loc}`);
  },

  updateProfile: (data: {
    name?: string;
    preferredLocale?: string;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request<import('@youniversity2/shared').User>('/api/dashboard/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getOAuthProviders: () =>
    request<{ google: boolean; microsoft: boolean }>('/api/auth/oauth/providers'),

  getMe: (sessionId?: string) => {
    const t = sessionId ?? get(token);
    const headers: Record<string, string> = {};
    if (t) headers.Authorization = `Bearer ${t}`;
    return request<import('@youniversity2/shared').User>('/api/auth/me', { headers });
  },

  login: (email: string, password: string) =>
    request<{ sessionId: string; accessToken: string; user: import('@youniversity2/shared').User }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    ),

  register: (data: { email: string; password: string; name: string; preferredLocale?: string }) =>
    request<{ sessionId: string; accessToken: string; user: import('@youniversity2/shared').User }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),

  getCourses: () => {
    const loc = get(locale);
    return request<unknown[]>(`/api/courses?locale=${loc}`);
  },

  getCourse: (id: string) => {
    const loc = get(locale);
    return request<Record<string, unknown>>(`/api/courses/${id}?locale=${loc}`);
  },

  translateCourse: (id: string, targetLocale: string) =>
    request<unknown>(`/api/courses/${id}/translate`, {
      method: 'POST',
      body: JSON.stringify({ targetLocale }),
    }),

  publishCourse: (id: string, isPublished: boolean) =>
    request<unknown>(`/api/courses/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished }),
    }),

  getEnrollments: (courseId: string) =>
    request<unknown[]>(`/api/enrollments?courseId=${courseId}`),

  getMyEnrollments: () => request<unknown[]>('/api/enrollments/my'),

  updateProgress: (data: {
    lessonId: string;
    percentComplete?: number;
    isComplete?: boolean;
    score?: number;
  }) =>
    request<unknown>('/api/progress', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCourseProgress: (courseId: string) =>
    request<unknown[]>(`/api/progress/course/${courseId}`),

  getActivity: (courseId: string) =>
    request<unknown[]>(`/api/progress/activity/course/${courseId}?limit=50`),
};

import { get } from 'svelte/store';
import { token, locale } from './auth';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const t = get(token);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: import('@youniversity2/shared').User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: { email: string; password: string; name: string; preferredLocale?: string }) =>
    request<{ accessToken: string; user: import('@youniversity2/shared').User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

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

import { get } from 'svelte/store';
import { token, locale, API_BASE } from './stores/auth';
import { getTabSessionId } from './session';

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
      credentials: 'include',
      headers: authHeaders(options.headers as Record<string, string>),
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('API fetch failed:', `${API_BASE}${path}`, e);
    }
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

  getStudentCoursesOverview: () => {
    const loc = get(locale);
    return request<{
      futureCourses: Array<Record<string, unknown>>;
      activeCourses: Array<Record<string, unknown>>;
      pastCourses: Array<Record<string, unknown>>;
    }>(`/api/dashboard/courses-overview?locale=${loc}`);
  },

  updateProfile: (data: {
    name?: string;
    preferredLocale?: string;
    givenName?: string | null;
    familyName?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    employeeId?: string | null;
    companyName?: string | null;
    officeLocation?: string | null;
    mobilePhone?: string | null;
    businessPhone?: string | null;
    city?: string | null;
    country?: string | null;
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

  deleteCourse: (id: string) =>
    request<{ ok: boolean }>(`/api/courses/${id}`, { method: 'DELETE' }),

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

  trackActivity: (data: {
    eventType: string;
    courseId?: string;
    lessonId?: string;
    payload?: Record<string, unknown>;
  }) =>
    request<unknown>('/api/progress/activity', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCategories: () => request<Array<Record<string, unknown>>>('/api/categories'),

  createCategory: (data: {
    slug: string;
    name: string;
    sortOrder?: number;
    parentId?: string | null;
  }) =>
    request<Record<string, unknown>>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: string, data: { slug?: string; name?: string; sortOrder?: number }) =>
    request<Record<string, unknown>>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: string) =>
    request<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),

  getStudents: (q?: string) =>
    request<Array<{ id: string; name: string; email: string }>>(
      q ? `/api/admin/students?q=${encodeURIComponent(q)}` : '/api/admin/students',
    ),

  createCourse: (data: {
    slug: string;
    title: string;
    description?: string;
    categoryId?: string | null;
    defaultLocale?: string;
  }) =>
    request<Record<string, unknown>>('/api/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCourse: (id: string, data: { categoryId?: string | null; slug?: string }) =>
    request<Record<string, unknown>>(`/api/courses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateCourseContent: (
    id: string,
    data: {
      title?: string;
      description?: string;
      slug?: string;
      isPublished?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
      locale?: string;
    },
  ) =>
    request<{ ok: boolean }>(`/api/courses/${id}/content`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  createCourseModule: (courseId: string, data: { title: string; sortOrder?: number }) =>
    request<Record<string, unknown>>(`/api/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCourseModule: (
    moduleId: string,
    data: { title?: string; sortOrder?: number; isRequired?: boolean },
  ) =>
    request<Record<string, unknown>>(`/api/modules/${moduleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCourseModule: (moduleId: string) =>
    request<{ ok: boolean }>(`/api/modules/${moduleId}`, { method: 'DELETE' }),

  createActivity: (
    moduleId: string,
    data: {
      type: string;
      title: string;
      content?: string;
      sortOrder?: number;
      isRequired?: boolean;
      config?: Record<string, unknown>;
    },
  ) =>
    request<Record<string, unknown>>(`/api/modules/${moduleId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateActivity: (
    activityId: string,
    data: {
      type?: string;
      title?: string;
      content?: string | null;
      moduleId?: string;
      sortOrder?: number;
      isRequired?: boolean;
      config?: Record<string, unknown>;
    },
  ) =>
    request<Record<string, unknown>>(`/api/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteActivity: (activityId: string) =>
    request<{ ok: boolean }>(`/api/activities/${activityId}`, { method: 'DELETE' }),

  getCourseCertificates: (courseId: string) =>
    request<
      Array<{
        id: string;
        certificateNumber: string;
        issuedAt: string;
        userName: string;
        userEmail: string;
      }>
    >(`/api/courses/${courseId}/certificates`),

  updateCompletionRules: (
    courseId: string,
    data: {
      rules: Array<{ type: string; config?: Record<string, unknown>; isRequired?: boolean }>;
      certificate?: { enabled: boolean; titleTemplate?: string };
    },
  ) =>
    request<unknown[]>(`/api/courses/${courseId}/completion-rules`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  revokeEnrollment: (enrollmentId: string) =>
    request<Record<string, unknown>>(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' }),

  deleteEnrollmentPermanently: (enrollmentId: string) =>
    request<{ ok: boolean }>(`/api/enrollments/${enrollmentId}/permanent`, { method: 'DELETE' }),

  createEnrollment: (userId: string, courseId: string) =>
    request<Record<string, unknown>>('/api/enrollments', {
      method: 'POST',
      body: JSON.stringify({ userId, courseId }),
    }),

  getUserLogs: (
    userId: string,
    params?: { q?: string; from?: string; to?: string; limit?: number; offset?: number },
  ) => {
    const loc = get(locale);
    const sp = new URLSearchParams({ locale: loc });
    if (params?.q) sp.set('q', params.q);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    return request<{
      userName: string;
      items: Array<Record<string, unknown>>;
      total: number;
      retentionFrom: string;
    }>(`/api/admin/users/${userId}/logs?${sp}`);
  },

  getAuthConfig: () =>
    request<{
      manualLoginEnabled: boolean;
      manualRegistrationEnabled: boolean;
      oauth: { google: { enabled: boolean }; microsoft: { enabled: boolean } };
    }>('/api/auth/config'),

  getAdminAuthSettings: () =>
    request<Record<string, unknown>>('/api/admin/auth-settings'),

  updateAdminAuthSettings: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/admin/auth-settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getUsers: () => request<Array<Record<string, unknown>>>('/api/admin/users'),

  getRegistrationHistory: (params: { q?: string; from?: string; to?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ items: Array<Record<string, unknown>>; limit: number; offset: number }>(
      `/api/admin/registrations/history${qs ? `?${qs}` : ''}`,
    );
  },

  getLoginHistory: (params: { q?: string; from?: string; to?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ items: Array<Record<string, unknown>>; limit: number; offset: number }>(
      `/api/admin/logins/history${qs ? `?${qs}` : ''}`,
    );
  },

  createUser: (data: {
    email: string;
    name: string;
    password: string;
    role: string;
    preferredLocale?: string;
  }) =>
    request<Record<string, unknown>>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (
    id: string,
    data: {
      email?: string;
      name?: string;
      role?: string;
      preferredLocale?: string;
      password?: string;
      isSuspended?: boolean;
      givenName?: string | null;
      familyName?: string | null;
      jobTitle?: string | null;
      department?: string | null;
      employeeId?: string | null;
      companyName?: string | null;
      officeLocation?: string | null;
      mobilePhone?: string | null;
      businessPhone?: string | null;
      city?: string | null;
      country?: string | null;
    },
  ) =>
    request<Record<string, unknown>>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
};

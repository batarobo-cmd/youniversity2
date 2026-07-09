import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/session';
import { requireAdmin, requireAuthToken, serverApiJson } from '$lib/server/api';
import { runServerApiMutation } from '$lib/server/mutations';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('admin:manage');
  const { token, user } = await parent();
  requireAuthToken(token);
  requireAdmin(user);

  const locale = user?.preferredLocale ?? 'sk';

  const [cats, courses] = await Promise.all([
    serverApiJson<unknown[]>(fetch, token, '/api/categories'),
    serverApiJson<unknown[]>(fetch, token, `/api/courses?locale=${locale}`),
  ]);

  const loadError =
    cats.error ?? courses.error ?? (cats.data && courses.data ? null : 'Nepodarilo sa načítať kategórie a kurzy.');

  return {
    categories: cats.data ?? [],
    courses: courses.data ?? [],
    loadError,
  };
};

export const actions = {  createCategory: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const fd = await request.formData();
    const name = fd.get('name')?.toString().trim() ?? '';
    const slug = fd.get('slug')?.toString().trim() ?? '';
    const parentId = fd.get('parentId')?.toString() || null;
    if (!name || !slug) return fail(400, { error: 'Neplatné údaje kategórie.' });

    return runServerApiMutation(fetch, token, '/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, parentId }),
    });
  },

  updateCategory: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const fd = await request.formData();
    const id = fd.get('id')?.toString();
    const name = fd.get('name')?.toString().trim() ?? '';
    const slug = fd.get('slug')?.toString().trim() ?? '';
    if (!id || !name || !slug) return fail(400, { error: 'Neplatné údaje kategórie.' });

    return runServerApiMutation(fetch, token, `/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });
  },

  deleteCategory: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const id = (await request.formData()).get('id')?.toString();
    if (!id) return fail(400, { error: 'Chýba ID kategórie.' });

    return runServerApiMutation(fetch, token, `/api/categories/${id}`, { method: 'DELETE' });
  },

  createCourse: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const fd = await request.formData();
    const slug = fd.get('slug')?.toString().trim() ?? '';
    const title = fd.get('title')?.toString().trim() ?? '';
    const description = fd.get('description')?.toString().trim() ?? '';
    const categoryId = fd.get('categoryId')?.toString() || null;
    const defaultLocale = fd.get('defaultLocale')?.toString() ?? 'sk';
    if (!slug || !title) return fail(400, { error: 'Neplatné údaje kurzu.' });

    return runServerApiMutation(fetch, token, '/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title, description, categoryId, defaultLocale }),
    });
  },

  publishCourse: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const fd = await request.formData();
    const id = fd.get('id')?.toString();
    const isPublished = fd.get('isPublished')?.toString() === 'true';
    if (!id) return fail(400, { error: 'Chýba ID kurzu.' });

    return runServerApiMutation(fetch, token, `/api/courses/${id}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished }),
    });
  },

  deleteCourse: async ({ request, cookies, fetch, parent }) => {
    const { user } = await parent();
    requireAdmin(user);
    const token = cookies.get(SESSION_COOKIE);
    requireAuthToken(token);

    const id = (await request.formData()).get('id')?.toString();
    if (!id) return fail(400, { error: 'Chýba ID kurzu.' });

    return runServerApiMutation(fetch, token, `/api/courses/${id}`, { method: 'DELETE' });
  },
};
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { token, user } = await parent();

  if (!token) redirect(303, '/');
  if (user?.role !== 'admin' && user?.role !== 'instructor') redirect(303, '/dashboard');

  const locale = user?.preferredLocale ?? 'sk';

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [catsRes, coursesRes] = await Promise.all([
      fetch(`${API_URL}/api/categories`, { headers }),
      fetch(`${API_URL}/api/courses?locale=${locale}`, { headers }),
    ]);

    if (!catsRes.ok || !coursesRes.ok) {
      return {
        categories: [],
        courses: [],
        loadError: 'Nepodarilo sa načítať kategórie a kurzy.',
      };
    }

    const [categories, courses] = await Promise.all([catsRes.json(), coursesRes.json()]);
    return { categories, courses, loadError: null };
  } catch {
    return {
      categories: [],
      courses: [],
      loadError: 'Nepodarilo sa spojiť so serverom.',
    };
  }
};

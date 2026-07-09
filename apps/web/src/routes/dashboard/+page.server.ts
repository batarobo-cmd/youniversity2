import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { handleApiQuery } from '$lib/server/api-action';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ parent, fetch, depends }) => {
  depends('student:dashboard');
  const { token, user } = await parent();

  if (!token) {
    redirect(303, '/');
  }

  const locale = user?.preferredLocale ?? 'sk';

  try {
    const res = await fetch(`${API_URL}/api/dashboard?locale=${locale}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return { dashboard: null, dashboardError: 'Nepodarilo sa načítať dashboard.' };
    }

    const dashboard = await res.json();
    return { dashboard, dashboardError: null };
  } catch {
    return {
      dashboard: null,
      dashboardError: 'API server nie je dostupný. Spustite bun run dev.',
    };
  }
};

export const actions = {
  apiQuery: ({ cookies, fetch, request }) => handleApiQuery(fetch, cookies, request, 'admin'),
};

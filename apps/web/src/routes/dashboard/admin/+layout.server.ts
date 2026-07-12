import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { readStudentViewCookie } from '$lib/server/api';

export const load: LayoutServerLoad = async ({ cookies }) => {
  if (readStudentViewCookie(cookies)) {
    redirect(303, '/dashboard');
  }

  return {};
};

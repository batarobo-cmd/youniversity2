import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { readStudentViewCookie } from '$lib/server/api';
import { STUDENT_VIEW_DEPENDS } from '$lib/student-view';

export const load: LayoutServerLoad = async ({ cookies, depends }) => {
  depends(STUDENT_VIEW_DEPENDS);
  if (readStudentViewCookie(cookies)) {
    redirect(303, '/dashboard');
  }

  return {};
};

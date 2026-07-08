import type { PageLoad } from './$types';

const defaultAuthConfig = {
  manualLoginEnabled: true,
  manualRegistrationEnabled: true,
  oauth: {
    google: { enabled: false },
    microsoft: { enabled: false },
  },
};

export const load: PageLoad = async ({ fetch }) => {
  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      return { authConfig: await res.json() };
    }
  } catch {
    // API unavailable during load — fall back to safe defaults
  }
  return { authConfig: defaultAuthConfig };
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const defaultAuthConfig = {
  manualLoginEnabled: true,
  manualRegistrationEnabled: true,
  oauth: {
    google: { enabled: false },
    microsoft: { enabled: false },
  },
};

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${API_URL}/api/auth/config`);
    if (res.ok) {
      return json(await res.json());
    }
  } catch {
    // API unavailable — safe defaults for login page
  }
  return json(defaultAuthConfig);
};

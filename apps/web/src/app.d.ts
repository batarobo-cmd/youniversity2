/// <reference types="@sveltejs/kit" />

import type { User } from '@youniversity2/shared';

declare global {
  namespace App {
    interface PageData {
      token?: string | null;
      user?: User | null;
      isAuthPage?: boolean;
      appVersion?: string;
    }
  }
}

export {};

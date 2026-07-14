import type { UserRole } from '@youniversity2/shared';

export type DemoUserRole = 'admin' | 'student' | 'system_admin';

export type DemoUserCredential = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  /** Protection password for system_admin role changes (demo only). */
  systemAdminGuardPassword?: string;
};

/** Local dev only — short aliases (admin / student / sysadmin). */
const LOCAL_DEMO_USERS: Record<DemoUserRole, DemoUserCredential> = {
  system_admin: {
    email: 'sysadmin@local',
    password: 'sysadmin',
    name: 'System Admin',
    role: 'system_admin',
    systemAdminGuardPassword: 'sysadmin-guard',
  },
  admin: {
    email: 'admin@local',
    password: 'admin',
    name: 'Admin',
    role: 'admin',
  },
  student: {
    email: 'student@local',
    password: 'student',
    name: 'Ján Študent',
    role: 'student',
  },
};

/** Production bootstrap emails — passwords come from DEMO_BOOTSTRAP_PASSWORD env, never from source. */
export const PRODUCTION_DEMO_EMAILS: Record<DemoUserRole, Omit<DemoUserCredential, 'password'>> = {
  system_admin: {
    email: 'sysadmin@youniversity2.sk',
    name: 'System Admin',
    role: 'system_admin',
    systemAdminGuardPassword: 'sysadmin-guard',
  },
  admin: {
    email: 'admin@youniversity2.sk',
    name: 'Admin',
    role: 'admin',
  },
  student: {
    email: 'student@youniversity2.sk',
    name: 'Ján Študent',
    role: 'student',
  },
};

const LEGACY_LOCAL_EMAILS: Record<DemoUserRole, string> = {
  system_admin: 'sysadmin@youniversity2.sk',
  admin: 'admin@youniversity2.sk',
  student: 'student@youniversity2.sk',
};

export function useLocalDevCredentials(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getDemoUserCredentials(): Record<DemoUserRole, DemoUserCredential> {
  if (!useLocalDevCredentials()) {
    throw new Error('Demo credentials are only available in local development (NODE_ENV !== production)');
  }
  return LOCAL_DEMO_USERS;
}

/** Production bootstrap password from env (min 12 chars). Not stored in git. */
export function getProductionBootstrapPassword(): string | null {
  const value = process.env.DEMO_BOOTSTRAP_PASSWORD?.trim();
  if (!value || value.length < 12) return null;
  return value;
}

export function buildProductionDemoCredentials(
  bootstrapPassword: string,
): Record<DemoUserRole, DemoUserCredential> {
  return {
    system_admin: { ...PRODUCTION_DEMO_EMAILS.system_admin, password: bootstrapPassword },
    admin: { ...PRODUCTION_DEMO_EMAILS.admin, password: bootstrapPassword },
    student: { ...PRODUCTION_DEMO_EMAILS.student, password: bootstrapPassword },
  };
}

export function getLegacyDemoEmails(): Record<DemoUserRole, string> | null {
  return useLocalDevCredentials() ? LEGACY_LOCAL_EMAILS : null;
}

export function resolveLoginIdentifier(input: string): string {
  const trimmed = input.trim();
  if (!useLocalDevCredentials() || trimmed.includes('@')) {
    return trimmed;
  }

  const key = trimmed.toLowerCase();
  const creds = getDemoUserCredentials();
  if (key === 'admin' || key === 'student' || key === 'sysadmin' || key === 'system_admin') {
    if (key === 'sysadmin' || key === 'system_admin') return creds.system_admin.email;
    return creds[key].email;
  }

  return trimmed;
}

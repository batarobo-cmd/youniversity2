export type DemoUserRole = 'admin' | 'student';

export type DemoUserCredential = {
  email: string;
  password: string;
  name: string;
  role: DemoUserRole;
};

const PRODUCTION_DEMO_USERS: Record<DemoUserRole, DemoUserCredential> = {
  admin: {
    email: 'admin@youniversity2.sk',
    password: 'admin123',
    name: 'Admin',
    role: 'admin',
  },
  student: {
    email: 'student@youniversity2.sk',
    password: 'student123',
    name: 'Ján Študent',
    role: 'student',
  },
};

const LOCAL_DEMO_USERS: Record<DemoUserRole, DemoUserCredential> = {
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

const LEGACY_LOCAL_EMAILS: Record<DemoUserRole, string> = {
  admin: 'admin@youniversity2.sk',
  student: 'student@youniversity2.sk',
};

export function useLocalDevCredentials(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getDemoUserCredentials(): Record<DemoUserRole, DemoUserCredential> {
  return useLocalDevCredentials() ? LOCAL_DEMO_USERS : PRODUCTION_DEMO_USERS;
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
  if (key === 'admin' || key === 'student') {
    return creds[key].email;
  }

  return trimmed;
}

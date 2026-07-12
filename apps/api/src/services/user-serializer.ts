import type { UserRow } from './user-profile';

export function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
    avatarUrl: user.avatarUrl ?? undefined,
    oauthProvider: user.oauthProvider ?? undefined,
    hasPassword: Boolean(user.passwordHash),
    needsSystemAdminPassword:
      user.role === 'system_admin' && !user.systemAdminPasswordHash,
    givenName: user.givenName ?? undefined,
    familyName: user.familyName ?? undefined,
    jobTitle: user.jobTitle ?? undefined,
    department: user.department ?? undefined,
    employeeId: user.employeeId ?? undefined,
    companyName: user.companyName ?? undefined,
    companyDomain: user.companyDomain ?? undefined,
    officeLocation: user.officeLocation ?? undefined,
    mobilePhone: user.mobilePhone ?? undefined,
    businessPhone: user.businessPhone ?? undefined,
    city: user.city ?? undefined,
    country: user.country ?? undefined,
    profileSyncedAt: user.profileSyncedAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}

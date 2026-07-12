import type { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

/** Corporate profile fields commonly available from Google Workspace / Microsoft 365. */
export interface CorporateProfile {
  email: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  jobTitle?: string;
  department?: string;
  employeeId?: string;
  companyName?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhone?: string;
  city?: string;
  country?: string;
  preferredLocale?: string;
  avatarUrl?: string;
}

export function extractEmailDomain(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at < 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}

export function composeDisplayName(givenName?: string, familyName?: string, fallback?: string): string {
  const parts = [givenName, familyName].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return fallback ?? '';
}

export function corporateProfileToDbFields(profile: CorporateProfile): Partial<UserInsert> {
  const domain = extractEmailDomain(profile.email);
  const fields: Partial<UserInsert> = {
    givenName: profile.givenName ?? null,
    familyName: profile.familyName ?? null,
    jobTitle: profile.jobTitle ?? null,
    department: profile.department ?? null,
    employeeId: profile.employeeId ?? null,
    companyName: profile.companyName ?? null,
    companyDomain: domain ?? null,
    officeLocation: profile.officeLocation ?? null,
    mobilePhone: profile.mobilePhone ?? null,
    businessPhone: profile.businessPhone ?? null,
    city: profile.city ?? null,
    country: profile.country ?? null,
    name: profile.displayName || composeDisplayName(profile.givenName, profile.familyName, profile.email),
    avatarUrl: profile.avatarUrl ?? null,
  };
  if (profile.preferredLocale) {
    fields.preferredLocale = profile.preferredLocale;
  }
  return fields;
}

/** Apply OAuth profile — only basic identity fields; work details are edited manually in profile. */
export function mergeOAuthProfile(
  existing: UserRow | null,
  profile: CorporateProfile,
  isFirstSync: boolean,
): Partial<UserInsert> {
  const now = new Date();
  const updates: Partial<UserInsert> = {
    updatedAt: now,
    name: profile.displayName || composeDisplayName(profile.givenName, profile.familyName, existing?.name ?? profile.email),
    avatarUrl: profile.avatarUrl ?? existing?.avatarUrl ?? null,
  };

  if (isFirstSync) {
    if (profile.givenName) updates.givenName = profile.givenName;
    if (profile.familyName) updates.familyName = profile.familyName;
    if (profile.preferredLocale && !existing?.preferredLocale) {
      updates.preferredLocale = profile.preferredLocale;
    }
    const domain = extractEmailDomain(profile.email);
    if (domain) updates.companyDomain = domain;
  }

  return updates;
}

export function isFirstProfileSync(existing: UserRow | null): boolean {
  return !existing?.givenName && !existing?.familyName && !existing?.name;
}

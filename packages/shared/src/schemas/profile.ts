import { z } from 'zod';
import { localeSchema, optionalString } from './_helpers';

export const profilePatchSchema = z.object({
  name: z.string().min(2).optional(),
  preferredLocale: localeSchema.optional(),
  givenName: optionalString(255),
  familyName: optionalString(255),
  jobTitle: optionalString(255),
  department: optionalString(255),
  employeeId: optionalString(64),
  companyName: optionalString(255),
  officeLocation: optionalString(255),
  mobilePhone: optionalString(64),
  businessPhone: optionalString(64),
  city: optionalString(128),
  country: optionalString(128),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

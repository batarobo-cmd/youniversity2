import type { Locale } from '@youniversity2/shared';
import { t } from '$lib/i18n';

/** Exact API error string → i18n key */
const API_ERROR_KEYS: Record<string, string> = {
  'At least one system administrator must remain. Assign another system admin before changing this role.':
    'admin.lastSystemAdminRoleBlocked',
  'Cannot delete the last system administrator. Assign another system admin first.':
    'admin.lastSystemAdminRoleBlocked',
  'Cannot suspend the last active system administrator. Assign another system admin first.':
    'admin.lastActiveSystemAdminBlocked',
  'Only system administrators can assign the system admin role': 'admin.systemAdminAssignBlocked',
  'Only system administrators can change the system administrator role': 'admin.systemAdminRoleLocked',
  'Only system administrators can create system admin accounts': 'admin.systemAdminCreateBlocked',
  'Only system administrators can suspend system administrator accounts':
    'admin.systemAdminSuspendBlocked',
  'Only system administrators can delete system administrator accounts':
    'admin.systemAdminDeleteBlocked',
  'System admin protection password required': 'admin.systemAdminPasswordRequired',
  'System administrator must set a protection password before this role can be changed':
    'admin.systemAdminPasswordNotSet',
  'Invalid system admin protection password': 'admin.systemAdminPasswordInvalid',
  'Email already registered': 'admin.usersEmailTaken',
  'Invalid input': 'admin.usersInvalidInput',
  'User not found': 'admin.usersNotFound',
  'Cannot suspend your own account': 'admin.usersCannotSuspendSelf',
  'Cannot delete your own account': 'admin.usersCannotDeleteSelf',
};

export function localizeAdminUserError(message: string, locale: Locale): string {
  const trimmed = message.trim();
  if (!trimmed) return '';

  const exact = API_ERROR_KEYS[trimmed];
  if (exact) return t(exact, locale);

  if (
    trimmed.includes('At least one system administrator') ||
    trimmed.includes('Assign another system admin') ||
    trimmed.includes('Cannot delete the last system administrator')
  ) {
    return t('admin.lastSystemAdminRoleBlocked', locale);
  }
  if (trimmed.includes('Cannot suspend the last active system administrator')) {
    return t('admin.lastActiveSystemAdminBlocked', locale);
  }
  if (trimmed.includes('Only system administrators can assign the system admin role')) {
    return t('admin.systemAdminAssignBlocked', locale);
  }
  if (trimmed.includes('Only system administrators can change the system administrator role')) {
    return t('admin.systemAdminRoleLocked', locale);
  }
  if (trimmed.includes('Invalid system admin protection password')) {
    return t('admin.systemAdminPasswordInvalid', locale);
  }
  if (trimmed.includes('System admin protection password required')) {
    return t('admin.systemAdminPasswordRequired', locale);
  }
  if (trimmed.includes('protection password before this role can be changed')) {
    return t('admin.systemAdminPasswordNotSet', locale);
  }

  // Already localized server messages (sk)
  if (
    trimmed.startsWith('Nepodarilo') ||
    trimmed.startsWith('Neplatn') ||
    trimmed.startsWith('Chýba') ||
    trimmed.startsWith('Nedostatočné') ||
    trimmed.startsWith('Operácia')
  ) {
    return trimmed;
  }

  return trimmed;
}

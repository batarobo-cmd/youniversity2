import bcrypt from 'bcryptjs';
import { and, eq, ne } from 'drizzle-orm';
import type { UserRole } from '@youniversity2/shared';
import { isSystemAdminRole } from '@youniversity2/shared';
import { db } from '../db';
import { users } from '../db/schema';

export const LAST_SYSTEM_ADMIN_ERROR =
  'At least one system administrator must remain. Assign another system admin before changing this role.';

export const LAST_ACTIVE_SYSTEM_ADMIN_ERROR =
  'Cannot suspend the last active system administrator. Assign another system admin first.';

export type RoleChangeValidation =
  | { ok: true; systemAdminPasswordHash?: string | null }
  | { ok: false; error: string; status: number };

export async function countSystemAdmins(excludeUserId?: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      excludeUserId
        ? and(eq(users.role, 'system_admin'), ne(users.id, excludeUserId))
        : eq(users.role, 'system_admin'),
    );
  return rows.length;
}

export async function countOtherSystemAdmins(excludeUserId: string): Promise<number> {
  return countSystemAdmins(excludeUserId);
}

export async function countActiveSystemAdmins(excludeUserId?: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      excludeUserId
        ? and(
            eq(users.role, 'system_admin'),
            eq(users.isSuspended, false),
            ne(users.id, excludeUserId),
          )
        : and(eq(users.role, 'system_admin'), eq(users.isSuspended, false)),
    );
  return rows.length;
}

export function wouldLeaveNoSystemAdmin(params: {
  currentRole: UserRole;
  newRole?: UserRole;
  deleteUser?: boolean;
}): boolean {
  const { currentRole, newRole, deleteUser } = params;
  if (!isSystemAdminRole(currentRole)) return false;
  if (deleteUser) return true;
  if (newRole && newRole !== 'system_admin') return true;
  return false;
}

export async function validateSystemAdminRemains(params: {
  targetUserId: string;
  currentRole: UserRole;
  newRole?: UserRole;
  deleteUser?: boolean;
}): Promise<RoleChangeValidation> {
  if (!wouldLeaveNoSystemAdmin(params)) return { ok: true };
  const others = await countOtherSystemAdmins(params.targetUserId);
  if (others === 0) {
    return { ok: false, error: LAST_SYSTEM_ADMIN_ERROR, status: 400 };
  }
  return { ok: true };
}

export async function validateActiveSystemAdminRemains(params: {
  targetUserId: string;
  currentRole: UserRole;
  currentlySuspended: boolean;
  willSuspend: boolean;
}): Promise<RoleChangeValidation> {
  const { targetUserId, currentRole, currentlySuspended, willSuspend } = params;
  if (!isSystemAdminRole(currentRole) || !willSuspend || currentlySuspended) {
    return { ok: true };
  }
  const otherActive = await countActiveSystemAdmins(targetUserId);
  if (otherActive === 0) {
    return { ok: false, error: LAST_ACTIVE_SYSTEM_ADMIN_ERROR, status: 400 };
  }
  return { ok: true };
}

export async function validateRoleChange(params: {
  actorUserId?: string;
  actorRole: UserRole;
  targetUserId: string;
  targetCurrentRole: UserRole;
  newRole?: UserRole;
  systemAdminPassword?: string;
  targetSystemAdminPasswordHash: string | null;
}): Promise<RoleChangeValidation> {
  const {
    actorUserId,
    actorRole,
    targetUserId,
    targetCurrentRole,
    newRole,
    systemAdminPassword,
    targetSystemAdminPasswordHash,
  } = params;

  if (!newRole || newRole === targetCurrentRole) return { ok: true };

  const promotingToSystemAdmin =
    newRole === 'system_admin' && targetCurrentRole !== 'system_admin';
  const demotingFromSystemAdmin =
    targetCurrentRole === 'system_admin' && newRole !== 'system_admin';
  const isSelfDemotion = Boolean(
    actorUserId && actorUserId === targetUserId && demotingFromSystemAdmin,
  );

  if (isSystemAdminRole(targetCurrentRole) && !isSystemAdminRole(actorRole) && !isSelfDemotion) {
    return {
      ok: false,
      error: 'Only system administrators can change the system administrator role',
      status: 403,
    };
  }

  if (promotingToSystemAdmin) {
    if (!isSystemAdminRole(actorRole)) {
      return {
        ok: false,
        error: 'Only system administrators can assign the system admin role',
        status: 403,
      };
    }
    return { ok: true, systemAdminPasswordHash: null };
  }

  if (demotingFromSystemAdmin) {
    const remainsCheck = await validateSystemAdminRemains({
      targetUserId,
      currentRole: targetCurrentRole,
      newRole,
    });
    if (!remainsCheck.ok) return remainsCheck;

    if (!systemAdminPassword) {
      return {
        ok: false,
        error: 'System admin protection password required',
        status: 400,
      };
    }
    if (!targetSystemAdminPasswordHash) {
      return {
        ok: false,
        error: 'System administrator must set a protection password before this role can be changed',
        status: 400,
      };
    }
    const valid = await bcrypt.compare(systemAdminPassword, targetSystemAdminPasswordHash);
    if (!valid) {
      return { ok: false, error: 'Invalid system admin protection password', status: 403 };
    }
    return { ok: true, systemAdminPasswordHash: null };
  }

  return { ok: true };
}

export function canAssignSystemAdminRole(actorRole: UserRole): boolean {
  return isSystemAdminRole(actorRole);
}

export async function canRemoveSystemAdmin(userId: string): Promise<boolean> {
  return (await countOtherSystemAdmins(userId)) > 0;
}

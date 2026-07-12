import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import { countSystemAdmins } from '../services/user-role-policy';
import { getDemoUserCredentials, useLocalDevCredentials } from '../services/demo-users';

/** Ensure at least one system_admin exists. Auto-restores demo sysadmin in local dev. */
export async function ensureSystemAdminExists(): Promise<void> {
  const total = await countSystemAdmins();
  if (total > 0) return;

  console.error('[system-admin] CRITICAL: No system administrator exists in the database.');

  if (!useLocalDevCredentials()) return;

  const creds = getDemoUserCredentials().system_admin;
  const [user] = await db.select().from(users).where(eq(users.email, creds.email)).limit(1);
  if (!user) return;

  const systemAdminPasswordHash = creds.systemAdminGuardPassword
    ? await bcrypt.hash(creds.systemAdminGuardPassword, 12)
    : null;

  await db
    .update(users)
    .set({
      role: 'system_admin',
      isSuspended: false,
      systemAdminPasswordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  console.warn(
    `[dev] Restored ${creds.email} as system_admin because none remained in the database.`,
  );
}

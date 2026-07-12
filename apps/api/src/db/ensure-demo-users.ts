import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import {
  getDemoUserCredentials,
  getLegacyDemoEmails,
  type DemoUserRole,
} from '../services/demo-users';

async function upsertDemoUser(role: DemoUserRole) {
  const creds = getDemoUserCredentials()[role];
  const passwordHash = await bcrypt.hash(creds.password, 12);
  const systemAdminPasswordHash =
    creds.role === 'system_admin' && creds.systemAdminGuardPassword
      ? await bcrypt.hash(creds.systemAdminGuardPassword, 12)
      : null;

  await db
    .insert(users)
    .values({
      email: creds.email,
      passwordHash,
      name: creds.name,
      role: creds.role,
      preferredLocale: 'sk',
      systemAdminPasswordHash,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash,
        name: creds.name,
        role: creds.role,
        systemAdminPasswordHash,
        updatedAt: new Date(),
      },
    });
}

async function migrateLegacyDemoUsers() {
  const legacyEmails = getLegacyDemoEmails();
  if (!legacyEmails) return;

  for (const role of ['system_admin', 'admin', 'student'] as const) {
    const creds = getDemoUserCredentials()[role];
    const [legacy] = await db
      .select()
      .from(users)
      .where(eq(users.email, legacyEmails[role]))
      .limit(1);

    if (!legacy) continue;

    const [targetExists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, creds.email))
      .limit(1);

    if (targetExists && targetExists.id !== legacy.id) continue;

    const systemAdminPasswordHash =
      creds.role === 'system_admin' && creds.systemAdminGuardPassword
        ? await bcrypt.hash(creds.systemAdminGuardPassword, 12)
        : null;

    await db
      .update(users)
      .set({
        email: creds.email,
        passwordHash: await bcrypt.hash(creds.password, 12),
        name: creds.name,
        role: creds.role,
        systemAdminPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, legacy.id));
  }
}

async function ensureDemoUsers() {
  await migrateLegacyDemoUsers();
  await upsertDemoUser('system_admin');
  await upsertDemoUser('admin');
  await upsertDemoUser('student');

  const creds = getDemoUserCredentials();
  console.log('Demo users ready:');
  if (getLegacyDemoEmails()) {
    console.log('  sysadmin / sysadmin  (guard: sysadmin-guard)');
    console.log('  admin / admin');
    console.log('  student / student');
  } else {
    console.log(`  ${creds.system_admin.email} / ${creds.system_admin.password}`);
    console.log(`  ${creds.admin.email} / ${creds.admin.password}`);
    console.log(`  ${creds.student.email} / ${creds.student.password}`);
  }
}

ensureDemoUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import {
  buildProductionDemoCredentials,
  getDemoUserCredentials,
  getLegacyDemoEmails,
  getProductionBootstrapPassword,
  useLocalDevCredentials,
  type DemoUserRole,
} from '../services/demo-users';

async function upsertDemoUser(role: DemoUserRole, creds: { email: string; password: string; name: string; role: string; systemAdminGuardPassword?: string }) {
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

async function migrateLegacyDemoUsers(
  credsByRole: Record<DemoUserRole, { email: string; password: string; name: string; role: string; systemAdminGuardPassword?: string }>,
) {
  const legacyEmails = getLegacyDemoEmails();
  if (!legacyEmails) return;

  for (const role of ['system_admin', 'admin', 'student'] as const) {
    const creds = credsByRole[role];
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
  let credsByRole: Record<DemoUserRole, { email: string; password: string; name: string; role: string; systemAdminGuardPassword?: string }>;

  if (useLocalDevCredentials()) {
    credsByRole = getDemoUserCredentials();
  } else {
    const bootstrapPassword = getProductionBootstrapPassword();
    if (!bootstrapPassword) {
      console.log(
        'Skipping demo user bootstrap in production (set DEMO_BOOTSTRAP_PASSWORD in .env for first deploy, then run deploy/aws-change-demo-passwords.sh).',
      );
      return;
    }
    credsByRole = buildProductionDemoCredentials(bootstrapPassword);
  }

  await migrateLegacyDemoUsers(credsByRole);
  await upsertDemoUser('system_admin', credsByRole.system_admin);
  await upsertDemoUser('admin', credsByRole.admin);
  await upsertDemoUser('student', credsByRole.student);

  console.log('Demo users ready:');
  if (getLegacyDemoEmails()) {
    console.log('  sysadmin / sysadmin  (guard: sysadmin-guard)');
    console.log('  admin / admin');
    console.log('  student / student');
  } else {
    console.log(`  ${credsByRole.admin.email} (password from DEMO_BOOTSTRAP_PASSWORD or aws-change-demo-passwords.sh)`);
    console.log(`  ${credsByRole.student.email} (same)`);
    console.log(`  ${credsByRole.system_admin.email} (same)`);
  }
}

ensureDemoUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

/** One-time style migration: legacy instructor accounts become admin. */
export async function migrateLegacyRoles() {
  const updated = await db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.role, 'instructor'))
    .returning({ id: users.id });
  if (updated.length > 0) {
    console.log(`[roles] Migrated ${updated.length} instructor account(s) to admin`);
  }
}

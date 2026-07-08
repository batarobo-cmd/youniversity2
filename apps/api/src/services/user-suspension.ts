import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

export const SUSPENDED_ACCOUNT_CODE = 'account_suspended';

export async function isUserSuspended(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuspended: users.isSuspended })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.isSuspended ?? false;
}

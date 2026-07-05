import { db } from '../db';
import { loginEvents } from '../db/schema';

export type LoginMethod = 'password' | 'oauth_google' | 'oauth_microsoft';

export async function recordLogin(userId: string, method: LoginMethod) {
  await db.insert(loginEvents).values({ userId, method });
}

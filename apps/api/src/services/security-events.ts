import { db } from '../db';
import { securityEvents } from '../db/schema';

export type SecurityEventCategory = 'auth' | 'oauth' | 'api' | 'media';
export type SecurityEventOutcome = 'success' | 'failure' | 'blocked';

export type RecordSecurityEventInput = {
  category: SecurityEventCategory;
  eventType: string;
  outcome: SecurityEventOutcome;
  userId?: string | null;
  email?: string | null;
  method?: string | null;
  ipAddress?: string | null;
  reasonCode?: string | null;
  payload?: Record<string, unknown>;
};

export async function recordSecurityEvent(input: RecordSecurityEventInput) {
  try {
    await db.insert(securityEvents).values({
      category: input.category,
      eventType: input.eventType,
      outcome: input.outcome,
      userId: input.userId ?? undefined,
      email: input.email ?? undefined,
      method: input.method ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      reasonCode: input.reasonCode ?? undefined,
      payload: input.payload ?? {},
    });
  } catch (err) {
    console.warn('[security-events] failed to record:', (err as Error).message);
  }
}

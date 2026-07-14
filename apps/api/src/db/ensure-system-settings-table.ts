import { sql } from 'drizzle-orm';
import { db } from './index';

/** Ensures system_settings exists (safe when migration 0001 was not applied yet). */
export async function ensureSystemSettingsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      id integer PRIMARY KEY DEFAULT 1 NOT NULL,
      settings jsonb NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
}

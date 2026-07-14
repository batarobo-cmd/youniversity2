import { sql } from 'drizzle-orm';
import { db } from './index';

/** Ensures SCORM tables exist (schema added after initial migration baseline). */
export async function ensureScormTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scorm_packages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE cascade,
      title varchar(500) DEFAULT 'SCORM package' NOT NULL,
      version varchar(32) NOT NULL,
      manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
      storage_prefix varchar(500) NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scorm_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE cascade,
      package_id uuid NOT NULL REFERENCES scorm_packages(id) ON DELETE cascade,
      sco_id varchar(255) NOT NULL,
      version varchar(32) NOT NULL,
      cmi jsonb DEFAULT '{}'::jsonb NOT NULL,
      started_at timestamp with time zone DEFAULT now() NOT NULL,
      last_commit_at timestamp with time zone,
      terminated_at timestamp with time zone
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scorm_attempt_user_lesson_sco_idx
      ON scorm_attempts (user_id, lesson_id, sco_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_events_course_created_idx
      ON activity_events (course_id, created_at)
  `);
}

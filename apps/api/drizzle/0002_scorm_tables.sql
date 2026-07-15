-- SCORM tables and FKs already exist in 0000_initial_schema.sql (legacy db:push baseline).
-- This migration only adds indexes that were missing from the initial dump.
CREATE INDEX IF NOT EXISTS "activity_events_course_created_idx" ON "activity_events" USING btree ("course_id","created_at");

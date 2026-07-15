CREATE TABLE IF NOT EXISTS "email_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "settings" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "notification_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "email_send_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" varchar(64) NOT NULL,
  "recipient_email" varchar(255) NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "course_id" uuid REFERENCES "courses"("id") ON DELETE SET NULL,
  "status" varchar(16) NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_send_log_created_idx" ON "email_send_log" ("created_at" DESC);

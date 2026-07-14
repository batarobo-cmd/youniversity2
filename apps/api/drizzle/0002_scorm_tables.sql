CREATE TABLE IF NOT EXISTS "scorm_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(500) DEFAULT 'SCORM package' NOT NULL,
	"version" varchar(32) NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_prefix" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scorm_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"sco_id" varchar(255) NOT NULL,
	"version" varchar(32) NOT NULL,
	"cmi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_commit_at" timestamp with time zone,
	"terminated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD CONSTRAINT "scorm_packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scorm_attempts" ADD CONSTRAINT "scorm_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scorm_attempts" ADD CONSTRAINT "scorm_attempts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scorm_attempts" ADD CONSTRAINT "scorm_attempts_package_id_scorm_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."scorm_packages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scorm_attempt_user_lesson_sco_idx" ON "scorm_attempts" USING btree ("user_id","lesson_id","sco_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_course_created_idx" ON "activity_events" USING btree ("course_id","created_at");

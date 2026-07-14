import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['system_admin', 'admin', 'instructor', 'student']);
export const lessonTypeEnum = pgEnum('lesson_type', [
  'presentation',
  'video',
  'audio',
  'text',
  'test',
  'certificate',
  'scorm',
  'quiz',
  'embed',
]);
export const videoSourceEnum = pgEnum('video_source', ['upload', 'youtube', 'vimeo', 'external']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active',
  'completed',
  'failed',
  'expired',
  'revoked',
  'suspended',
]);
export const completionRuleTypeEnum = pgEnum('completion_rule_type', [
  'all_lessons_complete',
  'video_watch_percent',
  'quiz_min_score',
  'lessons_in_order',
]);
export const translationSourceEnum = pgEnum('translation_source', ['manual', 'ai']);

export const oauthProviderEnum = pgEnum('oauth_provider', ['google', 'microsoft']);

export const courseCategories = pgTable('course_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references((): typeof courseCategories.id => courseCategories.id, {
    onDelete: 'cascade',
  }),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash'),
    name: varchar('name', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('student'),
    preferredLocale: varchar('preferred_locale', { length: 10 }).notNull().default('sk'),
    oauthProvider: oauthProviderEnum('oauth_provider'),
    oauthId: varchar('oauth_id', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    givenName: varchar('given_name', { length: 255 }),
    familyName: varchar('family_name', { length: 255 }),
    jobTitle: varchar('job_title', { length: 255 }),
    department: varchar('department', { length: 255 }),
    employeeId: varchar('employee_id', { length: 64 }),
    companyName: varchar('company_name', { length: 255 }),
    companyDomain: varchar('company_domain', { length: 255 }),
    officeLocation: varchar('office_location', { length: 255 }),
    mobilePhone: varchar('mobile_phone', { length: 64 }),
    businessPhone: varchar('business_phone', { length: 64 }),
    city: varchar('city', { length: 128 }),
    country: varchar('country', { length: 128 }),
    profileSyncedAt: timestamp('profile_synced_at', { withTimezone: true }),
    isSuspended: boolean('is_suspended').notNull().default(false),
    /** Password required to change role away from system_admin (or set when promoting to it). */
    systemAdminPasswordHash: text('system_admin_password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oauth_provider_id_idx').on(t.oauthProvider, t.oauthId)],
);

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  categoryId: uuid('category_id').references(() => courseCategories.id, { onDelete: 'set null' }),
  defaultLocale: varchar('default_locale', { length: 10 }).notNull().default('sk'),
  isPublished: boolean('is_published').notNull().default(false),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdById: uuid('created_by_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courseTranslations = pgTable(
  'course_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull().default(''),
    source: translationSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('course_locale_idx').on(t.courseId, t.locale)],
);

export const courseModules = pgTable('course_modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const moduleTranslations = pgTable(
  'module_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => courseModules.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    source: translationSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('module_locale_idx').on(t.moduleId, t.locale)],
);

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => courseModules.id, { onDelete: 'cascade' }),
  type: lessonTypeEnum('type').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(true),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lessonTranslations = pgTable(
  'lesson_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content'),
    source: translationSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('lesson_locale_idx').on(t.lessonId, t.locale)],
);

export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  points: integer('points').notNull().default(1),
  config: jsonb('config').notNull().default({}),
});

export const quizQuestionTranslations = pgTable(
  'quiz_question_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(),
    questionText: text('question_text').notNull(),
    options: jsonb('options').notNull().default([]),
    source: translationSourceEnum('source').notNull().default('manual'),
  },
  (t) => [uniqueIndex('question_locale_idx').on(t.questionId, t.locale)],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('user_course_idx').on(t.userId, t.courseId)],
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    percentComplete: integer('percent_complete').notNull().default(0),
    isComplete: boolean('is_complete').notNull().default(false),
    score: integer('score'),
    attempts: integer('attempts').notNull().default(0),
    progressState: jsonb('progress_state').$type<Record<string, unknown>>().notNull().default({}),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_lesson_idx').on(t.userId, t.lessonId)],
);

export const completionRules = pgTable('completion_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  type: completionRuleTypeEnum('type').notNull(),
  config: jsonb('config').notNull().default({}),
  isRequired: boolean('is_required').notNull().default(true),
});

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id),
  certificateNumber: varchar('certificate_number', { length: 10 }).notNull().unique(),
  pdfKey: varchar('pdf_key', { length: 500 }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courseCreatedIdx: index('activity_events_course_created_idx').on(table.courseId, table.createdAt),
  }),
);

export const scormPackages = pgTable('scorm_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull().default('SCORM package'),
  /** 'scorm_12' | 'scorm_2004' */
  version: varchar('version', { length: 32 }).notNull(),
  /** Parsed manifest (organizations/resources + derived SCO list). */
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  /** Base storage prefix, e.g. course-scorm/{courseId}/{packageId}/ */
  storagePrefix: varchar('storage_prefix', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scormAttempts = pgTable(
  'scorm_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => scormPackages.id, { onDelete: 'cascade' }),
    scoId: varchar('sco_id', { length: 255 }).notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    /** Runtime data store for GetValue/SetValue. */
    cmi: jsonb('cmi').$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastCommitAt: timestamp('last_commit_at', { withTimezone: true }),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('scorm_attempt_user_lesson_sco_idx').on(t.userId, t.lessonId, t.scoId)],
);

export const loginEvents = pgTable('login_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  method: varchar('method', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSettings = pgTable('auth_settings', {
  id: integer('id').primaryKey().default(1),
  settings: jsonb('settings').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().default(1),
  settings: jsonb('settings').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type CourseCategory = typeof courseCategories.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;

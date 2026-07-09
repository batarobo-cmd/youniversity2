export const SUPPORTED_LOCALES = ['sk', 'en', 'cs', 'de', 'hu'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'sk';

export const USER_ROLES = ['admin', 'instructor', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACTIVITY_TYPES = [
  'presentation',
  'video',
  'audio',
  'text',
  'test',
  'certificate',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** @deprecated Use ACTIVITY_TYPES — legacy DB values quiz/embed kept for migration */
export const LESSON_TYPES = [...ACTIVITY_TYPES, 'quiz', 'embed'] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const VIDEO_SOURCES = ['upload', 'youtube', 'vimeo', 'external'] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export const ENROLLMENT_STATUSES = ['active', 'completed', 'failed', 'expired', 'revoked', 'suspended'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const COMPLETION_RULE_TYPES = [
  'all_lessons_complete',
  'video_watch_percent',
  'quiz_min_score',
  'lessons_in_order',
] as const;
export type CompletionRuleType = (typeof COMPLETION_RULE_TYPES)[number];

export const TRANSLATION_SOURCES = ['manual', 'ai'] as const;
export type TranslationSource = (typeof TRANSLATION_SOURCES)[number];

import type {
  CompletionRuleType,
  EnrollmentStatus,
  LessonType,
  Locale,
  TranslationSource,
  UserRole,
  VideoSource,
} from './constants';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  preferredLocale: Locale;
  createdAt: string;
}

export interface Course {
  id: string;
  slug: string;
  defaultLocale: Locale;
  isPublished: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseTranslation {
  id: string;
  courseId: string;
  locale: Locale;
  title: string;
  description: string;
  source: TranslationSource;
  createdAt: string;
  updatedAt: string;
}

export interface CourseModule {
  id: string;
  courseId: string;
  sortOrder: number;
  isRequired: boolean;
}

export interface ModuleTranslation {
  id: string;
  moduleId: string;
  locale: Locale;
  title: string;
  source: TranslationSource;
}

export interface Lesson {
  id: string;
  moduleId: string;
  type: LessonType;
  sortOrder: number;
  isRequired: boolean;
  config: LessonConfig;
}

export interface LessonConfig {
  videoSource?: VideoSource;
  videoUrl?: string;
  embedUrl?: string;
  minWatchPercent?: number;
  passingScore?: number;
  maxAttempts?: number;
  fileKey?: string;
}

export interface LessonTranslation {
  id: string;
  lessonId: string;
  locale: Locale;
  title: string;
  content?: string;
  source: TranslationSource;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
  expiresAt?: string;
}

export interface LessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  percentComplete: number;
  isComplete: boolean;
  score?: number;
  attempts: number;
  lastActivityAt: string;
}

export interface CompletionRule {
  id: string;
  courseId: string;
  type: CompletionRuleType;
  config: Record<string, unknown>;
  isRequired: boolean;
}

export interface Certificate {
  id: string;
  userId: string;
  courseId: string;
  issuedAt: string;
  certificateNumber: string;
  pdfKey?: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  courseId?: string;
  lessonId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

export interface ApiError {
  error: string;
  code?: string;
}

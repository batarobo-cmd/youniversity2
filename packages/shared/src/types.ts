import type {
  ActivityType,
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
  avatarUrl?: string;
  oauthProvider?: 'google' | 'microsoft';
  hasPassword?: boolean;
  givenName?: string;
  familyName?: string;
  jobTitle?: string;
  department?: string;
  employeeId?: string;
  companyName?: string;
  companyDomain?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhone?: string;
  city?: string;
  country?: string;
  profileSyncedAt?: string;
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
  description?: string;
  source: TranslationSource;
}

export interface Lesson {
  id: string;
  moduleId: string;
  type: LessonType;
  sortOrder: number;
  isRequired: boolean;
  config: ActivityConfig;
}

/** Course content node (stored as `lessons` in DB). */
export type Activity = Lesson & { type: ActivityType | LessonType };

export interface ActivityConfig {
  videoSource?: VideoSource;
  videoCompletionMode?: 'manual_confirm' | 'watch_to_end';
  videoRequiredWatchSeconds?: number;
  videoUrl?: string;
  embedUrl?: string;
  audioUrl?: string;
  minWatchPercent?: number;
  passingScore?: number;
  maxAttempts?: number;
  fileKey?: string;
  presentationUrl?: string;
}

/** @deprecated Use ActivityConfig */
export type LessonConfig = ActivityConfig;

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

import { and, eq, inArray, max } from 'drizzle-orm';
import type { CourseReminderId } from '@youniversity2/shared';
import { db } from '../db';
import { courses, enrollments, lessonProgress, lessons, courseModules, users } from '../db/schema';
import type { Course, Enrollment } from '../db/schema';
import { getCourseTitle } from './activity-log';
import { mergeCourseReminder } from './course-notification-settings';
import { getEnrollmentProgressPercent } from './enrollment-achievement';
import { sendTemplatedEmail, shouldSkipCourseReminderSend } from './email-sender';
import { getEmailSettings } from './email-settings';
import { sendPlatformNotification } from './email-notify';
import { config } from '../config';

function publicWebUrl(): string {
  return config.oauth.webUrl.replace(/\/$/, '');
}

function courseUrl(courseId: string): string {
  return `${publicWebUrl()}/courses/${courseId}`;
}

function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK');
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function sendCourseReminderEmail(input: {
  course: Course;
  reminderId: CourseReminderId;
  userId: string;
  userName: string;
  userEmail: string;
  locale?: string;
  daysRemaining?: number;
  daysSinceEnrollment?: number;
  daysInactive?: number;
  repeatEveryDays?: number;
}): Promise<void> {
  const template = mergeCourseReminder(input.course, input.reminderId, input.locale);
  if (!template) return;

  if (
    await shouldSkipCourseReminderSend({
      notificationId: input.reminderId,
      userId: input.userId,
      courseId: input.course.id,
      repeatEveryDays: input.repeatEveryDays ?? template.repeatEveryDays,
    })
  ) {
    return;
  }

  const settings = await getEmailSettings();
  const locale = input.locale ?? input.course.defaultLocale ?? 'sk';
  const courseTitle = await getCourseTitle(input.course.id, locale);

  void sendTemplatedEmail({
    to: input.userEmail,
    userId: input.userId,
    courseId: input.course.id,
    notificationId: input.reminderId,
    subjectTemplate: template.subject,
    bodyHtmlTemplate: template.bodyHtml,
    vars: {
      userName: input.userName,
      userEmail: input.userEmail,
      platformName: settings.platformName,
      courseTitle,
      courseUrl: courseUrl(input.course.id),
      daysRemaining: input.daysRemaining != null ? String(input.daysRemaining) : '',
      daysSinceEnrollment:
        input.daysSinceEnrollment != null ? String(input.daysSinceEnrollment) : '',
      daysInactive: input.daysInactive != null ? String(input.daysInactive) : '',
      courseStartDate: formatDate(input.course.startsAt, locale),
      courseEndDate: formatDate(input.course.endsAt, locale),
    },
  });
}

async function isEnrollmentIncomplete(
  userId: string,
  courseId: string,
  enrollment: Pick<Enrollment, 'status'>,
): Promise<boolean> {
  if (enrollment.status === 'completed') return false;
  const progressPercent = await getEnrollmentProgressPercent(userId, courseId);
  return progressPercent < 100;
}

async function enrollmentHasAnyProgress(userId: string, courseId: string): Promise<boolean> {
  const progressPercent = await getEnrollmentProgressPercent(userId, courseId);
  return progressPercent > 0;
}

export async function sendCoursePublishedEmailsIfEligible(course: Course): Promise<void> {
  if (!course.isPublished || course.startsAt || course.endsAt) return;

  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(and(eq(enrollments.courseId, course.id), eq(enrollments.status, 'active')));

  const courseTitle = await getCourseTitle(course.id);

  for (const row of rows) {
    void sendPlatformNotification({
      notificationId: 'course.published',
      to: row.userEmail,
      userId: row.userId,
      courseId: course.id,
      userName: row.userName,
      userEmail: row.userEmail,
      locale: row.preferredLocale,
      courseTitle,
    });
  }
}

export async function sendCoursePublicationEmails(course: Course, kind: 'start' | 'end'): Promise<void> {
  const rows = await db
    .select({
      enrollment: enrollments,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(and(eq(enrollments.courseId, course.id), eq(enrollments.status, 'active')));

  const platformId = kind === 'start' ? 'course.started' : 'course.ended';
  const reminderId: CourseReminderId = kind === 'start' ? 'reminder.on_start' : 'reminder.on_end';
  const courseReminder = mergeCourseReminder(course, reminderId, row.preferredLocale);
  const courseTitle = await getCourseTitle(course.id);

  for (const row of rows) {
    if (kind === 'start') {
      if (courseReminder) {
        void sendCourseReminderEmail({
          course,
          reminderId,
          userId: row.userId,
          userName: row.userName,
          userEmail: row.userEmail,
          locale: row.preferredLocale,
        });
      } else {
        void sendPlatformNotification({
          notificationId: platformId,
          to: row.userEmail,
          userId: row.userId,
          courseId: course.id,
          userName: row.userName,
          userEmail: row.userEmail,
          locale: row.preferredLocale,
          courseTitle,
          courseStartDate: course.startsAt,
          courseEndDate: course.endsAt,
        });
      }
      continue;
    }

    const incomplete = await isEnrollmentIncomplete(row.userId, course.id, row.enrollment);
    if (!incomplete) {
      void sendPlatformNotification({
        notificationId: platformId,
        to: row.userEmail,
        userId: row.userId,
        courseId: course.id,
        userName: row.userName,
        userEmail: row.userEmail,
        locale: row.preferredLocale,
        courseTitle,
        courseStartDate: course.startsAt,
        courseEndDate: course.endsAt,
      });
      continue;
    }

    if (courseReminder) {
      void sendCourseReminderEmail({
        course,
        reminderId,
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        locale: row.preferredLocale,
      });
    } else {
      void sendPlatformNotification({
        notificationId: platformId,
        to: row.userEmail,
        userId: row.userId,
        courseId: course.id,
        userName: row.userName,
        userEmail: row.userEmail,
        locale: row.preferredLocale,
        courseTitle,
        courseStartDate: course.startsAt,
        courseEndDate: course.endsAt,
      });
    }
  }
}

async function courseLastActivityAt(userId: string, courseId: string): Promise<Date | null> {
  const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length === 0) return null;

  const courseLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(inArray(lessons.moduleId, moduleIds));
  const lessonIds = courseLessons.map((l) => l.id);
  if (lessonIds.length === 0) return null;

  const [row] = await db
    .select({ lastAt: max(lessonProgress.lastActivityAt) })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));

  return row?.lastAt ?? null;
}

export async function pollCourseReminderEmails(): Promise<void> {
  const now = new Date();
  const publishedCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true));

  for (const course of publishedCourses) {
    const activeEnrollments = await db
      .select({
        enrollment: enrollments,
        user: users,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.userId, users.id))
      .where(and(eq(enrollments.courseId, course.id), eq(enrollments.status, 'active')));

    for (const { enrollment, user } of activeEnrollments) {
      const beforeStart = mergeCourseReminder(course, 'reminder.before_start', user.preferredLocale);
      if (beforeStart && course.startsAt && course.startsAt > now) {
        const daysUntilStart = daysBetween(now, course.startsAt);
        if (daysUntilStart <= (beforeStart.daysBefore ?? 3)) {
          void sendCourseReminderEmail({
            course,
            reminderId: 'reminder.before_start',
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            locale: user.preferredLocale,
            daysRemaining: daysUntilStart,
          });
        }
      }

      const noProgress = mergeCourseReminder(course, 'reminder.no_progress', user.preferredLocale);
      if (noProgress) {
        const daysSince = daysBetween(enrollment.enrolledAt, now);
        if (daysSince >= (noProgress.daysAfterEnrollment ?? 7)) {
          const hasProgress = await enrollmentHasAnyProgress(user.id, course.id);
          if (!hasProgress) {
            void sendCourseReminderEmail({
              course,
              reminderId: 'reminder.no_progress',
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              locale: user.preferredLocale,
              daysSinceEnrollment: daysSince,
            });
          }
        }
      }

      const inactivity = mergeCourseReminder(course, 'reminder.inactivity', user.preferredLocale);
      if (inactivity) {
        const incomplete = await isEnrollmentIncomplete(user.id, course.id, enrollment);
        if (incomplete) {
          const hasProgress = await enrollmentHasAnyProgress(user.id, course.id);
          if (hasProgress) {
            const lastAt = await courseLastActivityAt(user.id, course.id);
            if (lastAt) {
              const daysInactive = daysBetween(lastAt, now);
              if (daysInactive >= (inactivity.daysInactive ?? 14)) {
                void sendCourseReminderEmail({
                  course,
                  reminderId: 'reminder.inactivity',
                  userId: user.id,
                  userName: user.name,
                  userEmail: user.email,
                  locale: user.preferredLocale,
                  daysInactive,
                  repeatEveryDays: inactivity.repeatEveryDays,
                });
              }
            }
          }
        }
      }

      const incomplete = await isEnrollmentIncomplete(user.id, course.id, enrollment);
      if (!incomplete) continue;

      const beforeEnd = mergeCourseReminder(course, 'reminder.before_end', user.preferredLocale);
      if (beforeEnd && course.endsAt && course.endsAt > now) {
        const daysRemaining = daysBetween(now, course.endsAt);
        if (daysRemaining <= (beforeEnd.daysBefore ?? 7)) {
          void sendCourseReminderEmail({
            course,
            reminderId: 'reminder.before_end',
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            locale: user.preferredLocale,
            daysRemaining,
          });
        }
      }
    }
  }
}

export function startEmailReminderScheduler() {
  const intervalMs = 15 * 60 * 1000;
  void pollCourseReminderEmails();
  setInterval(() => {
    void pollCourseReminderEmails();
  }, intervalMs);
}

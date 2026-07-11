import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '../db';
import {
  completionRules,
  courseModules,
  enrollments,
  lessonProgress,
  lessons,
  certificates,
} from '../db/schema';
import { broadcastToCourse, broadcastToUser } from '../realtime/hub';
import {
  countsForCourseCompletion,
  isProgressFullyComplete,
} from './course-completion';
import { allocateCertificateNumber } from './certificate-number';
import { ensureCertificatePdf } from './certificate-document';

async function isCourseCertificateEnabled(
  courseId: string,
  rules: Array<{ config: unknown }>,
): Promise<boolean> {
  const fromRules = rules.some(
    (rule) => (rule.config as { certificate?: { enabled?: boolean } })?.certificate?.enabled,
  );
  if (fromRules) return true;

  const [row] = await db
    .select({ total: count() })
    .from(certificates)
    .where(eq(certificates.courseId, courseId));

  return Number(row?.total ?? 0) > 0;
}

async function hasCertificateForCurrentAttempt(
  userId: string,
  courseId: string,
  enrolledAt: Date,
): Promise<boolean> {
  const rows = await db
    .select({ issuedAt: certificates.issuedAt })
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)));

  return rows.some((row) => row.issuedAt >= enrolledAt);
}

async function issueCourseCertificate(userId: string, courseId: string) {
  const certNumber = await allocateCertificateNumber();
  const [certificate] = await db
    .insert(certificates)
    .values({
      userId,
      courseId,
      certificateNumber: certNumber,
    })
    .returning();

  try {
    await ensureCertificatePdf(certificate.id);
  } catch (error) {
    console.error('Certificate PDF generation failed:', error);
  }

  return certificate;
}

export async function evaluateCourseCompletion(userId: string, courseId: string) {
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map((m) => m.id);
  const courseLessons =
    moduleIds.length > 0
      ? (await db.select().from(lessons)).filter((l) => moduleIds.includes(l.moduleId))
      : [];

  const requiredLessons = courseLessons.filter((l) => countsForCourseCompletion(l));
  const lessonIds = requiredLessons.map((l) => l.id);

  const progress =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)))
      : [];

  const passed =
    requiredLessons.length === 0
      ? true
      : requiredLessons.every((lesson) => {
          const row = progress.find((p) => p.lessonId === lesson.id);
          return isProgressFullyComplete(row);
        });

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);

  if (!enrollment || ['suspended', 'revoked'].includes(enrollment.status)) {
    return { passed, enrollment };
  }

  if (!passed) return { passed, enrollment };

  const rules = await db.select().from(completionRules).where(eq(completionRules.courseId, courseId));
  const certEnabled = await isCourseCertificateEnabled(courseId, rules);

  let updatedEnrollment = enrollment;
  let changed = false;

  if (enrollment.status === 'active') {
    [updatedEnrollment] = await db
      .update(enrollments)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(enrollments.id, enrollment.id))
      .returning();

    changed = true;

    if (certEnabled) {
      await issueCourseCertificate(userId, courseId);
    }
  } else if (enrollment.status === 'completed') {
    const hasCurrentCert = await hasCertificateForCurrentAttempt(
      userId,
      courseId,
      enrollment.enrolledAt,
    );

    if (certEnabled && !hasCurrentCert) {
      await issueCourseCertificate(userId, courseId);
      [updatedEnrollment] = await db
        .update(enrollments)
        .set({ completedAt: new Date() })
        .where(eq(enrollments.id, enrollment.id))
        .returning();
      changed = true;
    }
  } else {
    return { passed, enrollment };
  }

  if (!changed) {
    return { passed, enrollment: updatedEnrollment };
  }

  const payload = {
    userId,
    courseId,
    status: 'completed' as const,
    enrollmentId: updatedEnrollment.id,
  };

  broadcastToUser(userId, {
    type: 'completion_evaluated',
    payload,
    timestamp: new Date().toISOString(),
  });

  broadcastToCourse(courseId, {
    type: 'completion_evaluated',
    payload,
    timestamp: new Date().toISOString(),
  });

  return { passed, enrollment: updatedEnrollment };
}

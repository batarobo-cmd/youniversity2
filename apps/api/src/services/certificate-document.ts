import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import {
  certificates,
  courseTranslations,
  courses,
  users,
} from '../db/schema';
import { generateCertificatePdf, type CertificatePdfLocale } from './certificate-pdf';
import { getCertificatePdfObject, uploadCertificatePdf } from './storage';

async function resolveCourseTitle(courseId: string, locale: string, fallback: string) {
  const [translation] = await db
    .select({ title: courseTranslations.title })
    .from(courseTranslations)
    .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, locale)))
    .limit(1);

  return translation?.title?.trim() || fallback;
}

export async function buildCertificatePdfInput(certificateId: string) {
  const [row] = await db
    .select({
      id: certificates.id,
      certificateNumber: certificates.certificateNumber,
      issuedAt: certificates.issuedAt,
      userId: certificates.userId,
      courseId: certificates.courseId,
      studentName: users.name,
      preferredLocale: users.preferredLocale,
      courseSlug: courses.slug,
      defaultLocale: courses.defaultLocale,
    })
    .from(certificates)
    .innerJoin(users, eq(certificates.userId, users.id))
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(certificates.id, certificateId))
    .limit(1);

  if (!row) return null;

  const locale = (row.preferredLocale === 'en' ? 'en' : 'sk') as CertificatePdfLocale;

  const baseTitle = await resolveCourseTitle(
    row.courseId,
    locale,
    await resolveCourseTitle(row.courseId, row.defaultLocale, row.courseSlug),
  );

  return {
    studentName: row.studentName,
    courseTitle: baseTitle,
    certificateNumber: row.certificateNumber,
    issuedAt: row.issuedAt,
    locale,
  };
}

export async function ensureCertificatePdf(certificateId: string): Promise<string | null> {
  const [existing] = await db
    .select({ pdfKey: certificates.pdfKey })
    .from(certificates)
    .where(eq(certificates.id, certificateId))
    .limit(1);

  if (existing?.pdfKey) return existing.pdfKey;

  const input = await buildCertificatePdfInput(certificateId);
  if (!input) return null;

  const pdfBytes = await generateCertificatePdf(input);
  const [row] = await db
    .select({ courseId: certificates.courseId })
    .from(certificates)
    .where(eq(certificates.id, certificateId))
    .limit(1);
  if (!row) return null;

  const uploaded = await uploadCertificatePdf(row.courseId, certificateId, pdfBytes);
  await db
    .update(certificates)
    .set({ pdfKey: uploaded.fileKey })
    .where(eq(certificates.id, certificateId));

  return uploaded.fileKey;
}

export async function readCertificatePdfBytes(certificateId: string) {
  const pdfKey = await ensureCertificatePdf(certificateId);
  if (!pdfKey) return null;

  const object = await getCertificatePdfObject(pdfKey);
  if (!object?.Body) return null;

  const bytes = await object.Body.transformToByteArray();
  return {
    bytes,
    contentType: object.ContentType ?? 'application/pdf',
    fileName: `certificate-${certificateId}.pdf`,
  };
}

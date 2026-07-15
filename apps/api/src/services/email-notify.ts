import type { PlatformNotificationId } from '@youniversity2/shared';
import { config } from '../config';
import { readCertificatePdfBytes } from './certificate-document';
import { resolvePlatformNotificationTemplate } from './email-locale';
import { getEmailSettings } from './email-settings';
import { sendTemplatedEmail, type SendEmailInput } from './email-sender';
import { getCourseTitle } from './activity-log';
import { normalizeEmailLocale } from '@youniversity2/shared';

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

export async function sendPlatformNotification(input: {
  notificationId: PlatformNotificationId;
  to: string;
  userId?: string | null;
  courseId?: string | null;
  userName: string;
  userEmail: string;
  locale?: string;
  courseTitle?: string;
  certificateNumber?: string;
  certificateId?: string;
  daysRemaining?: string;
  daysSinceEnrollment?: string;
  daysInactive?: string;
  courseStartDate?: Date | string | null;
  courseEndDate?: Date | string | null;
}): Promise<void> {
  const settings = await getEmailSettings();
  const template = resolvePlatformNotificationTemplate(
    settings,
    input.notificationId,
    input.locale,
  );
  if (!template) return;

  const locale = normalizeEmailLocale(input.locale);
  const title =
    input.courseTitle ??
    (input.courseId ? await getCourseTitle(input.courseId, locale) : '');

  let attachments: SendEmailInput['attachments'];

  if (input.notificationId === 'certificate.issued' && input.certificateId) {
    const pdf = await readCertificatePdfBytes(input.certificateId);
    if (pdf) {
      const fileName = input.certificateNumber
        ? `YOUniversity2-${input.certificateNumber}.pdf`
        : pdf.fileName;
      attachments = [
        {
          filename: fileName,
          content: Buffer.from(pdf.bytes),
          contentType: pdf.contentType,
        },
      ];
    }
  }

  void sendTemplatedEmail({
    to: input.to,
    userId: input.userId,
    courseId: input.courseId,
    notificationId: input.notificationId,
    subjectTemplate: template.subject,
    bodyHtmlTemplate: template.bodyHtml,
    attachments,
    vars: {
      userName: input.userName,
      userEmail: input.userEmail,
      platformName: settings.platformName,
      courseTitle: title,
      courseUrl: input.courseId ? courseUrl(input.courseId) : publicWebUrl(),
      certificateNumber: input.certificateNumber ?? '',
      daysRemaining: input.daysRemaining ?? '',
      daysSinceEnrollment: input.daysSinceEnrollment ?? '',
      daysInactive: input.daysInactive ?? '',
      courseStartDate: formatDate(input.courseStartDate, locale),
      courseEndDate: formatDate(input.courseEndDate, locale),
    },
  });
}

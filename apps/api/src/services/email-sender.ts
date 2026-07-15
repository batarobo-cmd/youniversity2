import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import { and, desc, eq } from 'drizzle-orm';
import { renderEmailTemplate, type EmailTemplateVariable } from '@youniversity2/shared';
import { db } from '../db';
import { emailSendLog } from '../db/schema';
import { getEmailSettings, isEmailConfigured, type EmailSettingsData } from './email-settings';

let cachedTransport: Transporter | null = null;
let cachedFingerprint = '';

function smtpFingerprint(settings: EmailSettingsData): string {
  const s = settings.smtp;
  return [s.host, s.port, s.secure, s.useStartTls, s.username, s.password, s.fromEmail].join('|');
}

async function getTransport(settings: EmailSettingsData): Promise<Transporter | null> {
  if (!isEmailConfigured(settings)) return null;
  const fp = smtpFingerprint(settings);
  if (cachedTransport && cachedFingerprint === fp) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    requireTLS: settings.smtp.useStartTls && !settings.smtp.secure,
    auth: settings.smtp.username
      ? { user: settings.smtp.username, pass: settings.smtp.password }
      : undefined,
  });
  cachedFingerprint = fp;
  return cachedTransport;
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getEmailSettings();
  const transport = await getTransport(settings);
  if (!transport) return { ok: false, error: 'SMTP is not configured' };
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  notificationId: string;
  userId?: string | null;
  courseId?: string | null;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const settings = await getEmailSettings();
  const transport = await getTransport(settings);
  if (!transport) {
    await logEmailSend({ ...input, status: 'skipped', errorMessage: 'SMTP not configured' });
    return { ok: false, error: 'SMTP not configured' };
  }

  const from = settings.smtp.fromName
    ? `"${settings.smtp.fromName}" <${settings.smtp.fromEmail}>`
    : settings.smtp.fromEmail;

  try {
    await transport.sendMail({
      from,
      to: input.to,
      replyTo: settings.smtp.replyTo || undefined,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType ?? 'application/pdf',
      })),
    });
    await logEmailSend({ ...input, status: 'sent', errorMessage: null });
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    await logEmailSend({ ...input, status: 'failed', errorMessage: message });
    return { ok: false, error: message };
  }
}

async function logEmailSend(input: SendEmailInput & { status: string; errorMessage: string | null }) {
  try {
    await db.insert(emailSendLog).values({
      notificationId: input.notificationId,
      recipientEmail: input.to,
      userId: input.userId ?? null,
      courseId: input.courseId ?? null,
      status: input.status,
      errorMessage: input.errorMessage,
    });
  } catch (err) {
    console.warn('[email] failed to log send:', (err as Error).message);
  }
}

export async function sendTemplatedEmail(input: {
  to: string;
  userId?: string | null;
  courseId?: string | null;
  notificationId: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  vars: Partial<Record<EmailTemplateVariable, string>>;
  attachments?: SendEmailInput['attachments'];
}): Promise<{ ok: boolean; error?: string }> {
  const subject = renderEmailTemplate(input.subjectTemplate, input.vars);
  const html = renderEmailTemplate(input.bodyHtmlTemplate, input.vars);
  return sendEmail({
    to: input.to,
    subject,
    html,
    notificationId: input.notificationId,
    userId: input.userId,
    courseId: input.courseId,
    attachments: input.attachments,
  });
}

export async function wasEmailAlreadySent(input: {
  notificationId: string;
  userId?: string | null;
  courseId?: string | null;
}): Promise<boolean> {
  const lastSent = await getLastSuccessfulEmailSentAt(input);
  return lastSent != null;
}

export async function getLastSuccessfulEmailSentAt(input: {
  notificationId: string;
  userId?: string | null;
  courseId?: string | null;
}): Promise<Date | null> {
  const filters = [
    eq(emailSendLog.notificationId, input.notificationId),
    eq(emailSendLog.status, 'sent'),
  ];
  if (input.userId) filters.push(eq(emailSendLog.userId, input.userId));
  if (input.courseId) filters.push(eq(emailSendLog.courseId, input.courseId));

  const [row] = await db
    .select({ createdAt: emailSendLog.createdAt })
    .from(emailSendLog)
    .where(and(...filters))
    .orderBy(desc(emailSendLog.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}

/** One-time reminders skip after first send; repeating reminders respect repeatEveryDays. */
export async function shouldSkipCourseReminderSend(input: {
  notificationId: string;
  userId: string;
  courseId: string;
  repeatEveryDays?: number;
  now?: Date;
}): Promise<boolean> {
  const lastSent = await getLastSuccessfulEmailSentAt({
    notificationId: input.notificationId,
    userId: input.userId,
    courseId: input.courseId,
  });
  if (!lastSent) return false;

  const repeatEveryDays = input.repeatEveryDays ?? 0;
  if (repeatEveryDays > 0) {
    const now = input.now ?? new Date();
    const daysSinceLast = Math.floor((now.getTime() - lastSent.getTime()) / (24 * 60 * 60 * 1000));
    return daysSinceLast < repeatEveryDays;
  }

  return true;
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getEmailSettings();
  return sendTemplatedEmail({
    to,
    notificationId: 'smtp.test',
    subjectTemplate: 'Test e-mail — {{platformName}}',
    bodyHtmlTemplate:
      '<p>Toto je testovací e-mail z {{platformName}}. Ak ho vidíte, SMTP funguje správne.</p>',
    vars: { platformName: settings.platformName },
  });
}

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { certificates } from '../db/schema';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { isStaff } from '../services/course-access';
import { readCertificatePdfBytes } from '../services/certificate-document';

export const certificateRoutes = new Hono();

certificateRoutes.use('*', authMiddleware);

async function canDownloadCertificate(user: AuthUser, certificateId: string) {
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, certificateId))
    .limit(1);

  if (!certificate) return null;
  if (isStaff(user) || certificate.userId === user.id) return certificate;
  return null;
}

certificateRoutes.get('/:certificateId/download', async (c) => {
  const user = c.get('user') as AuthUser;
  const certificateId = c.req.param('certificateId');
  const certificate = await canDownloadCertificate(user, certificateId);
  if (!certificate) return c.json({ error: 'Certificate not found' }, 404);

  const file = await readCertificatePdfBytes(certificateId);
  if (!file) return c.json({ error: 'Certificate PDF unavailable' }, 404);

  const downloadName = `YOUniversity2-${certificate.certificateNumber}.pdf`;
  return new Response(file.bytes, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getCourseVideoObject,
  isAllowedVideoSize,
  isAllowedVideoType,
  uploadCourseVideo,
} from '../services/storage';

export const mediaRoutes = new Hono();

mediaRoutes.use('*', authMiddleware);

mediaRoutes.post('/videos', requireRole('admin', 'instructor'), async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  const courseId = form.get('courseId')?.toString().trim();

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing video file' }, 400);
  }
  if (!courseId) {
    return c.json({ error: 'Missing courseId' }, 400);
  }
  if (!isAllowedVideoType(file.type || 'application/octet-stream')) {
    return c.json({ error: 'Unsupported video format. Use MP4, WebM, MOV, AVI, or OGG.' }, 400);
  }
  if (!isAllowedVideoSize(file.size)) {
    return c.json({ error: 'Video is too large (max 500 MB).' }, 413);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadCourseVideo(
    courseId,
    file.name || 'video.mp4',
    file.type || 'video/mp4',
    buffer,
  );

  return c.json(uploaded, 201);
});

mediaRoutes.get('/videos/*', async (c) => {
  const fileKey = decodeURIComponent(c.req.param('*') ?? '');
  const object = await getCourseVideoObject(fileKey);
  if (!object?.Body) {
    return c.json({ error: 'Video not found' }, 404);
  }

  const headers = new Headers();
  if (object.ContentType) headers.set('Content-Type', object.ContentType);
  if (object.ContentLength != null) headers.set('Content-Length', String(object.ContentLength));
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Accept-Ranges', 'bytes');

  return new Response(object.Body as ReadableStream, { headers });
});

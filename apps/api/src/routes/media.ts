import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  authorizePresentationFileAccess,
  signPresentationAccessToken,
} from '../services/media-access';
import {
  getCoursePresentationObject,
  getCourseVideoObject,
  inferPresentationContentType,
  isAllowedPresentationFile,
  isAllowedPresentationSize,
  isAllowedVideoSize,
  isAllowedVideoType,
  uploadCoursePresentation,
  uploadCourseVideo,
} from '../services/storage';

export const mediaRoutes = new Hono();

mediaRoutes.post('/videos', authMiddleware, requireRole('admin', 'instructor'), async (c) => {
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

mediaRoutes.post('/presentations', authMiddleware, requireRole('admin', 'instructor'), async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  const courseId = form.get('courseId')?.toString().trim();
  const fileName = file instanceof File ? file.name || 'presentation.pdf' : 'presentation.pdf';
  const rawType = file instanceof File ? file.type || 'application/octet-stream' : 'application/octet-stream';
  const contentType = inferPresentationContentType(fileName, rawType);

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing presentation file' }, 400);
  }
  if (!courseId) {
    return c.json({ error: 'Missing courseId' }, 400);
  }
  if (!isAllowedPresentationFile(fileName, contentType)) {
    return c.json(
      { error: 'Unsupported format. Use PDF, PPT, PPTX, PPS, PPSX, PPTM, or ODP.' },
      400,
    );
  }
  if (!isAllowedPresentationSize(file.size)) {
    return c.json({ error: 'Presentation is too large (max 100 MB).' }, 413);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadCoursePresentation(courseId, fileName, contentType, buffer);

  return c.json(uploaded, 201);
});

mediaRoutes.get('/presentations/access-token', authMiddleware, async (c) => {
  const fileKey = c.req.query('fileKey')?.trim();
  if (!fileKey || !fileKey.startsWith('course-presentations/')) {
    return c.json({ error: 'Invalid fileKey' }, 400);
  }

  const object = await getCoursePresentationObject(fileKey);
  if (!object) {
    return c.json({ error: 'Presentation not found' }, 404);
  }

  const accessToken = await signPresentationAccessToken(fileKey);
  return c.json({ accessToken });
});

mediaRoutes.get('/presentations/:path{.+}', async (c) => {
  const fileKey = decodeURIComponent(c.req.param('path') ?? '');
  if (!(await authorizePresentationFileAccess(c, fileKey))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const object = await getCoursePresentationObject(fileKey);
  if (!object?.Body) {
    return c.json({ error: 'Presentation not found' }, 404);
  }

  const headers = new Headers();
  if (object.ContentType) headers.set('Content-Type', object.ContentType);
  if (object.ContentLength != null) headers.set('Content-Length', String(object.ContentLength));
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.Body as ReadableStream, { headers });
});

mediaRoutes.get('/videos/:path{.+}', authMiddleware, async (c) => {
  const fileKey = decodeURIComponent(c.req.param('path') ?? '');
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

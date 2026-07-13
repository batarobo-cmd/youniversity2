import { Hono } from 'hono';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { canStudentViewCourse } from '../services/course-access';
import {
  authorizePresentationFileAccess,
  signPresentationAccessToken,
} from '../services/media-access';
import {
  getCoursePresentationObject,
  getCourseVideoObject,
  getScormAssetObject,
  inferPresentationContentType,
  inferScormContentType,
  isAllowedPresentationFile,
  isAllowedPresentationSize,
  isAllowedScormZipSize,
  isAllowedScormZipType,
  isAllowedVideoSize,
  isAllowedVideoType,
  scormStoragePrefix,
  uploadScormAsset,
  uploadCoursePresentation,
  uploadCourseVideo,
} from '../services/storage';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import { db } from '../db';
import { scormPackages } from '../db/schema';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';

export const mediaRoutes = new Hono();

const scormVersionSchema = z.enum(['scorm_12', 'scorm_2004']);

function findManifestEntry(zip: AdmZip) {
  const entry = zip.getEntries().find((e) => {
    const normalized = e.entryName.replace(/\\/g, '/').trim().toLowerCase();
    return normalized.endsWith('imsmanifest.xml');
  });
  return entry ?? null;
}

function manifestBaseDir(entryName: string) {
  const normalized = entryName.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx + 1) : '';
}

function safeZipEntryPath(entryName: string) {
  const normalized = entryName.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.includes('..')) return null;
  if (normalized.endsWith('/')) return null;
  return normalized;
}

type ScormSco = {
  id: string;
  title: string;
  launch: string;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeScormType(value: unknown) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  // Some tools emit weird casing/values; treat anything not 'asset' as possibly launchable.
  return v;
}

function walkManifestItems(items: any[], out: any[] = []) {
  for (const item of items) {
    if (!item) continue;
    out.push(item);
    const nested = asArray(item?.item);
    if (nested.length > 0) walkManifestItems(nested, out);
  }
  return out;
}

function deriveScosFromManifest(manifest: any): { scos: ScormSco[]; detectedVersion: 'scorm_12' | 'scorm_2004' } {
  const m = manifest?.manifest ?? manifest;
  const resources = asArray(m?.resources?.resource);
  const organizations = asArray(m?.organizations?.organization);

  // Heuristic: prefer scormType/adlcp:scormType on resources (sco vs asset)
  const scoResources = resources.filter((r: any) => {
    const scormType = (r?.['adlcp:scormtype'] ?? r?.['adlcp:scormType'] ?? r?.scormtype ?? r?.scormType ?? '')
      .toString()
      .toLowerCase();
    return scormType === 'sco';
  });

  const resourceById = new Map<string, any>();
  for (const r of resources) {
    const id = (r?.['@_identifier'] ?? r?.identifier ?? '').toString();
    if (id) resourceById.set(id, r);
  }

  // Prefer items that reference a SCO resource
  const scos: ScormSco[] = [];
  for (const org of organizations) {
    const flatItems = walkManifestItems(asArray(org?.item));
    for (const item of flatItems) {
      const identifierref = (item?.['@_identifierref'] ?? item?.identifierref ?? '').toString();
      if (!identifierref) continue;
      const res = resourceById.get(identifierref);
      if (!res) continue;
      const resScormType = normalizeScormType(
        res?.['adlcp:scormtype'] ?? res?.['adlcp:scormType'] ?? res?.scormtype ?? res?.scormType ?? '',
      );
      // Many packages omit scormType; treat referenced resources with href as launchable unless explicitly 'asset'.
      if (resScormType && resScormType === 'asset') continue;

      const href = (res?.['@_href'] ?? res?.href ?? '').toString();
      if (!href) continue;

      const title = (item?.title ?? 'SCO').toString();
      const id = (res?.['@_identifier'] ?? res?.identifier ?? identifierref).toString();
      scos.push({ id, title, launch: href });
    }
  }

  // Fallback: resources marked as SCO (or not marked as asset) without org items
  if (scos.length === 0) {
    const candidates = scoResources.length
      ? scoResources
      : resources.filter((r: any) => normalizeScormType(r?.['adlcp:scormtype'] ?? r?.['adlcp:scormType'] ?? r?.scormtype ?? r?.scormType ?? '') !== 'asset');
    for (const r of candidates) {
      const href = (r?.['@_href'] ?? r?.href ?? '').toString();
      const id = (r?.['@_identifier'] ?? r?.identifier ?? '').toString() || href;
      if (!href) continue;
      scos.push({ id, title: id, launch: href });
    }
  }

  // Very light detection: SCORM 2004 packages often include 'adlcp:scormType' + 2004 namespaces.
  const raw = JSON.stringify(m ?? {});
  const detectedVersion: 'scorm_12' | 'scorm_2004' = raw.includes('adlcp:scormType') || raw.includes('imsss:') ? 'scorm_2004' : 'scorm_12';

  return { scos, detectedVersion };
}

mediaRoutes.post('/videos', authMiddleware, requireRole('admin'), async (c) => {
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

mediaRoutes.post('/scorm', authMiddleware, requireRole('admin'), async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  const courseId = form.get('courseId')?.toString().trim();
  const forcedVersion = form.get('version')?.toString().trim();

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing SCORM package (.zip).' }, 400);
  }
  if (!courseId) {
    return c.json({ error: 'Missing courseId' }, 400);
  }
  if (!isAllowedScormZipType(file.type || 'application/octet-stream')) {
    return c.json({ error: 'Unsupported format. Upload a .zip SCORM package.' }, 400);
  }
  if (!isAllowedScormZipSize(file.size)) {
    return c.json({ error: 'SCORM package is too large (max 500 MB).' }, 413);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  // AdmZip is more reliable with Buffer than Uint8Array.
  const zip = new AdmZip(Buffer.from(buffer));
  const manifestEntry = findManifestEntry(zip);
  if (!manifestEntry) {
    const names = zip
      .getEntries()
      .slice(0, 60)
      .map((e) => e.entryName.replace(/\\/g, '/'));
    return c.json(
      {
        error: 'imsmanifest.xml not found in the SCORM package.',
        debug: { entriesSample: names, entriesTotal: zip.getEntries().length },
      },
      400,
    );
  }

  const baseDir = manifestBaseDir(manifestEntry.entryName);
  const manifestXml = manifestEntry.getData().toString('utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(manifestXml);
  } catch {
    return c.json({ error: 'Failed to parse imsmanifest.xml.' }, 400);
  }

  const { scos, detectedVersion } = deriveScosFromManifest(parsed);
  if (scos.length === 0) {
    return c.json({ error: 'No launchable SCO found in imsmanifest.xml.' }, 400);
  }

  const version =
    forcedVersion && scormVersionSchema.safeParse(forcedVersion).success
      ? (forcedVersion as 'scorm_12' | 'scorm_2004')
      : detectedVersion;

  const packageId = randomUUID();
  const storagePrefix = scormStoragePrefix(courseId, packageId);

  // Upload every file in the archive.
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const full = safeZipEntryPath(entry.entryName);
    if (!full) continue;
    // Store relative to the manifest base dir so `href="index.html"` resolves even if the zip has a wrapper folder.
    if (baseDir && !full.startsWith(baseDir)) continue;
    const rel = baseDir ? full.slice(baseDir.length) : full;
    if (!rel) continue;
    if (!rel) continue;
    const body = new Uint8Array(entry.getData());
    const uploaded = await uploadScormAsset(storagePrefix, rel, body);
    if (!uploaded) {
      return c.json({ error: `Invalid SCORM entry path: ${entry.entryName}` }, 400);
    }
  }

  const title = (file.name || 'SCORM package').replace(/\.zip$/i, '');
  const [row] = await db
    .insert(scormPackages)
    .values({
      id: packageId,
      courseId,
      title,
      version,
      manifest: {
        manifestPath: manifestEntry.entryName.replace(/\\/g, '/'),
        baseDir,
        scos,
        raw: parsed as Record<string, unknown>,
      },
      storagePrefix,
      updatedAt: new Date(),
    })
    .returning();

  return c.json(
    {
      packageId: row.id,
      title: row.title,
      version: row.version,
      storagePrefix: row.storagePrefix,
      scos,
    },
    201,
  );
});

mediaRoutes.post('/presentations', authMiddleware, requireRole('admin'), async (c) => {
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

mediaRoutes.get('/scorm/:courseId/:packageId/:path{.+}', authMiddleware, async (c) => {
  const user = c.get('user') as AuthUser;
  const courseId = c.req.param('courseId');
  const packageId = c.req.param('packageId');
  const rel = decodeURIComponent(c.req.param('path') ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return c.json({ error: 'Invalid path' }, 400);

  if (!(await canStudentViewCourse(user, courseId, c))) {
    return c.json({ error: 'Not found' }, 404);
  }

  const [pkg] = await db
    .select({ storagePrefix: scormPackages.storagePrefix })
    .from(scormPackages)
    .where(and(eq(scormPackages.id, packageId), eq(scormPackages.courseId, courseId)))
    .limit(1);
  if (!pkg) return c.json({ error: 'Not found' }, 404);

  const fileKey = `${pkg.storagePrefix}${rel}`;
  const object = await getScormAssetObject(fileKey);
  if (!object?.Body) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.ContentType || inferScormContentType(fileKey));
  if (object.ContentLength != null) headers.set('Content-Length', String(object.ContentLength));
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.Body as ReadableStream, { headers });
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

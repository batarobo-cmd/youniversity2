import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { config } from '../config';

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/ogg',
]);

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const ALLOWED_PRESENTATION_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.slideshow.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  'application/vnd.oasis.opendocument.presentation',
]);

const ALLOWED_PRESENTATION_EXTENSIONS = new Set([
  '.pdf',
  '.ppt',
  '.pptx',
  '.pps',
  '.ppsx',
  '.pptm',
  '.odp',
]);

const PRESENTATION_EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pps': 'application/vnd.ms-powerpoint',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.pptm': 'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
};

const MAX_PRESENTATION_BYTES = 100 * 1024 * 1024;

let bucketReady = false;

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
});

async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
  }
  bucketReady = true;
}

function sanitizeFileName(name: string) {
  const base = name.replace(/[/\\]/g, '_').replace(/[^\w.\-() ]+/g, '_').trim();
  return base || 'video.mp4';
}

export function isAllowedVideoType(contentType: string) {
  return ALLOWED_VIDEO_TYPES.has(contentType.toLowerCase());
}

export function isAllowedVideoSize(size: number) {
  return size > 0 && size <= MAX_VIDEO_BYTES;
}

export async function uploadCourseVideo(
  courseId: string,
  fileName: string,
  contentType: string,
  body: Uint8Array,
) {
  await ensureBucket();

  const safeName = sanitizeFileName(fileName);
  const fileKey = `course-videos/${courseId}/${randomUUID()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: fileKey,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    fileKey,
    fileName: safeName,
    contentType,
    videoUrl: `/api/media/videos/${fileKey}`,
  };
}

export async function getCourseVideoObject(fileKey: string) {
  if (!fileKey || fileKey.includes('..')) return null;
  if (!fileKey.startsWith('course-videos/')) return null;

  try {
    return await s3.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: fileKey,
      }),
    );
  } catch {
    return null;
  }
}

function sanitizePresentationFileName(name: string) {
  const base = name.replace(/[/\\]/g, '_').replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, '_').trim();
  return base || 'presentation.pdf';
}

function presentationExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function inferPresentationContentType(fileName: string, contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized && normalized !== 'application/octet-stream' && ALLOWED_PRESENTATION_TYPES.has(normalized)) {
    return normalized;
  }
  const ext = presentationExtension(fileName);
  return PRESENTATION_EXTENSION_TO_MIME[ext] ?? normalized;
}

export function isAllowedPresentationFile(fileName: string, contentType: string) {
  const normalized = inferPresentationContentType(fileName, contentType);
  if (ALLOWED_PRESENTATION_TYPES.has(normalized)) return true;
  return ALLOWED_PRESENTATION_EXTENSIONS.has(presentationExtension(fileName));
}

export function isAllowedPresentationType(contentType: string) {
  return ALLOWED_PRESENTATION_TYPES.has(contentType.toLowerCase());
}

export function isAllowedPresentationSize(size: number) {
  return size > 0 && size <= MAX_PRESENTATION_BYTES;
}

export async function uploadCoursePresentation(
  courseId: string,
  fileName: string,
  contentType: string,
  body: Uint8Array,
) {
  await ensureBucket();

  const safeName = sanitizePresentationFileName(fileName);
  const fileKey = `course-presentations/${courseId}/${randomUUID()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: fileKey,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    fileKey,
    fileName: safeName,
    contentType,
    presentationUrl: `/api/media/presentations/${fileKey.split('/').map(encodeURIComponent).join('/')}`,
  };
}

export async function getCoursePresentationObject(fileKey: string) {
  if (!fileKey || fileKey.includes('..')) return null;
  if (!fileKey.startsWith('course-presentations/')) return null;

  try {
    return await s3.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: fileKey,
      }),
    );
  } catch {
    return null;
  }
}

export async function uploadCertificatePdf(courseId: string, certificateId: string, body: Uint8Array) {
  await ensureBucket();

  const fileKey = `certificates/${courseId}/${certificateId}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: fileKey,
      Body: body,
      ContentType: 'application/pdf',
    }),
  );

  return {
    fileKey,
    downloadUrl: `/api/certificates/${certificateId}/download`,
  };
}

export async function getCertificatePdfObject(fileKey: string) {
  if (!fileKey || fileKey.includes('..')) return null;
  if (!fileKey.startsWith('certificates/')) return null;

  try {
    return await s3.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: fileKey,
      }),
    );
  } catch {
    return null;
  }
}

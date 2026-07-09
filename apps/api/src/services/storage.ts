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

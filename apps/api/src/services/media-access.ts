import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config';
import { resolveRequestUser, verifyToken, type AuthUser } from '../middleware/auth';
import { resolveSessionForStaticAsset } from './session';

const secret = new TextEncoder().encode(config.jwtSecret);

export const SCORM_ACCESS_COOKIE = 'yo2_scorm_access';

export async function signPresentationAccessToken(fileKey: string): Promise<string> {
  return new SignJWT({ purpose: 'presentation', fileKey })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
}

export async function verifyPresentationAccessToken(token: string, fileKey: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.purpose === 'presentation' && payload.fileKey === fileKey;
  } catch {
    return false;
  }
}

export async function authorizePresentationFileAccess(c: Context, fileKey: string): Promise<boolean> {
  const access = c.req.query('access');
  if (access && (await verifyPresentationAccessToken(access, fileKey))) return true;
  const user = await resolveRequestUser(c);
  return Boolean(user);
}

export async function signScormPackageAccessToken(
  courseId: string,
  packageId: string,
  userId: string,
): Promise<string> {
  return new SignJWT({ purpose: 'scorm_package', courseId, packageId, sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(secret);
}

export async function verifyScormPackageAccessToken(
  token: string,
  courseId: string,
  packageId: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== 'scorm_package') return null;
    if (payload.courseId !== courseId || payload.packageId !== packageId) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function extractSessionIdFromRequest(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)yo2_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Fast auth for SCORM static assets — JWT cookie/query first, then Redis-only session + course check. */
export async function authorizeScormPackageAccess(
  c: Context,
  courseId: string,
  packageId: string,
  canViewCourse: (user: AuthUser) => Promise<boolean>,
): Promise<boolean> {
  const accessQuery = c.req.query('access');
  const accessCookie = getCookie(c, SCORM_ACCESS_COOKIE);
  for (const token of [accessQuery, accessCookie]) {
    if (!token) continue;
    const userId = await verifyScormPackageAccessToken(token, courseId, packageId);
    if (userId) return true;
  }

  const sessionId = extractSessionIdFromRequest(c);
  if (!sessionId) return false;

  let user: AuthUser | null = await resolveSessionForStaticAsset(sessionId);
  if (!user) user = await verifyToken(sessionId);
  if (!user) return false;

  return canViewCourse(user);
}

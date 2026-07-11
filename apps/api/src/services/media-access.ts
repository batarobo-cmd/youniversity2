import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import { config } from '../config';
import { resolveRequestUser } from '../middleware/auth';

const secret = new TextEncoder().encode(config.jwtSecret);

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

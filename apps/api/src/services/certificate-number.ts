import { randomInt } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { certificates } from '../db/schema';

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const CERTIFICATE_NUMBER_PATTERN = /^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/;

function randomPart(length: number): string {
  let part = '';
  for (let i = 0; i < length; i++) {
    part += CHARSET[randomInt(0, CHARSET.length)];
  }
  return part;
}

export function generateCertificateNumber(): string {
  return `${randomPart(3)}-${randomPart(3)}`;
}

export function isLegacyCertificateNumber(value: string): boolean {
  return !CERTIFICATE_NUMBER_PATTERN.test(value);
}

export async function allocateCertificateNumber(used = new Set<string>()): Promise<string> {
  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate = generateCertificateNumber();
    if (used.has(candidate)) continue;

    const [existing] = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(eq(certificates.certificateNumber, candidate))
      .limit(1);

    if (!existing) return candidate;
    used.add(candidate);
  }

  throw new Error('Failed to allocate unique certificate number');
}

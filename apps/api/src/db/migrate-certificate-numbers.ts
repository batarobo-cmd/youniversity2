import { eq } from 'drizzle-orm';
import { db } from './index';
import { certificates } from './schema';
import {
  allocateCertificateNumber,
  isLegacyCertificateNumber,
} from '../services/certificate-number';

async function migrateCertificateNumbers() {
  const rows = await db.select().from(certificates);
  const used = new Set(
    rows.filter((row) => !isLegacyCertificateNumber(row.certificateNumber)).map((row) => row.certificateNumber),
  );

  let updated = 0;

  for (const row of rows) {
    if (!isLegacyCertificateNumber(row.certificateNumber)) continue;

    const certificateNumber = await allocateCertificateNumber(used);
    used.add(certificateNumber);

    await db.update(certificates).set({ certificateNumber }).where(eq(certificates.id, row.id));
    updated++;
    console.log(`  ${row.certificateNumber} -> ${certificateNumber}`);
  }

  console.log(`Certificate numbers migrated: ${updated} updated, ${rows.length - updated} already in new format`);
}

migrateCertificateNumbers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

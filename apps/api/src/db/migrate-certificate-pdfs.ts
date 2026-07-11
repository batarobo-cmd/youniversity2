import { isNull } from 'drizzle-orm';
import { db } from './index';
import { certificates } from './schema';
import { ensureCertificatePdf } from '../services/certificate-document';

async function migrateCertificatePdfs() {
  const rows = await db
    .select({ id: certificates.id, certificateNumber: certificates.certificateNumber })
    .from(certificates)
    .where(isNull(certificates.pdfKey));

  if (rows.length === 0) {
    console.log('All certificates already have PDFs.');
    return;
  }

  let generated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const pdfKey = await ensureCertificatePdf(row.id);
      if (pdfKey) {
        generated++;
        console.log(`  ✓ ${row.certificateNumber}`);
      } else {
        failed++;
        console.log(`  ✗ ${row.certificateNumber} (missing data)`);
      }
    } catch (error) {
      failed++;
      console.error(`  ✗ ${row.certificateNumber}`, error);
    }
  }

  console.log(`Certificate PDFs: ${generated} generated, ${failed} failed, ${rows.length} total`);
}

migrateCertificatePdfs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

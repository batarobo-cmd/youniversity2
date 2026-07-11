import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type CertificatePdfLocale = 'sk' | 'en';

export interface CertificatePdfInput {
  studentName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  locale?: CertificatePdfLocale;
}

const BRAND = {
  indigo: rgb(0.388, 0.4, 0.945),
  purple: rgb(0.545, 0.361, 0.965),
  pink: rgb(0.925, 0.282, 0.6),
  text: rgb(0.067, 0.094, 0.153),
  muted: rgb(0.42, 0.447, 0.502),
  border: rgb(0.898, 0.906, 0.922),
  surface: rgb(0.976, 0.98, 0.984),
};

const COPY = {
  sk: {
    badge: 'Certifikát o absolvovaní',
    lead: 'Týmto sa potvrdzuje, že',
    completed: 'úspešne absolvoval/-a kurz',
    certId: 'ID certifikátu',
    issued: 'Dátum vystavenia',
    footer: 'Vydané platformou YOUniversity2',
  },
  en: {
    badge: 'Certificate of completion',
    lead: 'This certifies that',
    completed: 'has successfully completed the course',
    certId: 'Certificate ID',
    issued: 'Issue date',
    footer: 'Issued by YOUniversity2',
  },
} as const;

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '../assets/fonts');

let regularFontPromise: Promise<Uint8Array> | null = null;
let boldFontPromise: Promise<Uint8Array> | null = null;

async function loadFont(fileName: string) {
  return new Uint8Array(await readFile(join(assetsDir, fileName)));
}

function getRegularFontBytes() {
  regularFontPromise ??= loadFont('Inter-Regular.ttf');
  return regularFontPromise;
}

function getBoldFontBytes() {
  boldFontPromise ??= loadFont('Inter-Bold.ttf');
  return boldFontPromise;
}

function formatIssueDate(date: Date, locale: CertificatePdfLocale) {
  return date.toLocaleDateString(locale === 'sk' ? 'sk-SK' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function drawBrandLogo(page: PDFPage, x: number, y: number, bold: PDFFont) {
  const markSize = 32;

  page.drawRectangle({
    x,
    y,
    width: markSize * 0.55,
    height: markSize,
    color: BRAND.indigo,
    borderWidth: 0,
  });
  page.drawRectangle({
    x: x + markSize * 0.35,
    y,
    width: markSize * 0.35,
    height: markSize,
    color: BRAND.purple,
    borderWidth: 0,
  });
  page.drawRectangle({
    x: x + markSize * 0.65,
    y,
    width: markSize * 0.35,
    height: markSize,
    color: BRAND.pink,
    borderWidth: 0,
  });

  page.drawText('YO', {
    x: x + markSize / 2 - bold.widthOfTextAtSize('YO', 11) / 2,
    y: y + 11,
    size: 11,
    font: bold,
    color: rgb(1, 1, 1),
  });

  return { markSize };
}

function drawMetaCard(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  regular: PDFFont,
  bold: PDFFont,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height: 58,
    color: BRAND.surface,
    borderColor: BRAND.border,
    borderWidth: 1,
  });
  page.drawText(label.toUpperCase(), {
    x: x + 14,
    y: y + 36,
    size: 8,
    font: regular,
    color: BRAND.muted,
  });
  page.drawText(value, {
    x: x + 14,
    y: y + 16,
    size: 13,
    font: bold,
    color: BRAND.text,
  });
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const locale: CertificatePdfLocale = input.locale === 'en' ? 'en' : 'sk';
  const copy = COPY[locale];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([getRegularFontBytes(), getBoldFontBytes()]);
  const regular = await pdfDoc.embedFont(regularBytes);
  const bold = await pdfDoc.embedFont(boldBytes);

  const page = pdfDoc.addPage([842, 595]);
  const { width, height } = page.getSize();
  const margin = 42;

  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderColor: BRAND.border,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: margin + 10,
    y: margin + 10,
    width: width - margin * 2 - 20,
    height: height - margin * 2 - 20,
    borderColor: rgb(0.933, 0.933, 0.988),
    borderWidth: 1,
  });

  page.drawRectangle({
    x: margin,
    y: height - margin - 8,
    width: width - margin * 2,
    height: 8,
    color: BRAND.indigo,
  });
  page.drawRectangle({
    x: width / 2 - 80,
    y: height - margin - 8,
    width: 160,
    height: 8,
    color: BRAND.purple,
  });
  page.drawRectangle({
    x: width - margin - 120,
    y: height - margin - 8,
    width: 120,
    height: 8,
    color: BRAND.pink,
  });

  const logoX = margin + 36;
  const logoY = height - margin - 76;
  const { markSize } = drawBrandLogo(page, logoX, logoY, bold);
  page.drawText('YOUniversity2', {
    x: logoX + markSize + 10,
    y: logoY + 12,
    size: 16,
    font: bold,
    color: BRAND.text,
  });

  const badgeWidth = regular.widthOfTextAtSize(copy.badge.toUpperCase(), 10) + 28;
  page.drawRectangle({
    x: width - margin - 36 - badgeWidth,
    y: height - margin - 58,
    width: badgeWidth,
    height: 28,
    color: rgb(0.933, 0.933, 0.988),
    borderColor: rgb(0.796, 0.835, 0.996),
    borderWidth: 1,
  });
  page.drawText(copy.badge.toUpperCase(), {
    x: width - margin - 36 - badgeWidth + 14,
    y: height - margin - 49,
    size: 10,
    font: bold,
    color: BRAND.indigo,
  });

  const contentWidth = width - margin * 2 - 72;
  const centerX = width / 2;

  page.drawText(copy.lead, {
    x: centerX - regular.widthOfTextAtSize(copy.lead, 14) / 2,
    y: height - margin - 150,
    size: 14,
    font: regular,
    color: BRAND.muted,
  });

  const nameLines = wrapText(input.studentName, bold, 30, contentWidth);
  let nameY = height - margin - 188;
  for (const line of nameLines.slice(0, 2)) {
    page.drawText(line, {
      x: centerX - bold.widthOfTextAtSize(line, 30) / 2,
      y: nameY,
      size: 30,
      font: bold,
      color: BRAND.text,
    });
    nameY -= 36;
  }

  page.drawText(copy.completed, {
    x: centerX - regular.widthOfTextAtSize(copy.completed, 14) / 2,
    y: nameY - 8,
    size: 14,
    font: regular,
    color: BRAND.muted,
  });

  const courseLines = wrapText(input.courseTitle, bold, 22, contentWidth);
  let courseY = nameY - 42;
  for (const line of courseLines.slice(0, 2)) {
    page.drawText(line, {
      x: centerX - bold.widthOfTextAtSize(line, 22) / 2,
      y: courseY,
      size: 22,
      font: bold,
      color: BRAND.indigo,
    });
    courseY -= 28;
  }

  const cardWidth = (width - margin * 2 - 96) / 2;
  const cardY = margin + 56;
  drawMetaCard(
    page,
    margin + 36,
    cardY,
    cardWidth,
    copy.certId,
    input.certificateNumber,
    regular,
    bold,
  );
  drawMetaCard(
    page,
    margin + 36 + cardWidth + 24,
    cardY,
    cardWidth,
    copy.issued,
    formatIssueDate(input.issuedAt, locale),
    regular,
    bold,
  );

  page.drawText(copy.footer, {
    x: centerX - regular.widthOfTextAtSize(copy.footer, 10) / 2,
    y: margin + 28,
    size: 10,
    font: regular,
    color: BRAND.muted,
  });

  return pdfDoc.save();
}

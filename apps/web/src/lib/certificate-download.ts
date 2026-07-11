export function certificateDownloadUrl(certificateId: string) {
  return `/api/certificates/${certificateId}/download`;
}

export function certificateDownloadFileName(certificateNumber: string) {
  return `YOUniversity2-${certificateNumber}.pdf`;
}

export function formatCertificateIssuedAt(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

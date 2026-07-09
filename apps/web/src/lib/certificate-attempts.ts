export type CertificateItem = {
  id: string;
  certificateNumber: string;
  issuedAt: string;
};

export function splitCertificatesByAttempt(
  certificates: CertificateItem[],
  enrolledAt?: string | null,
): { current: CertificateItem | null; historical: CertificateItem[] } {
  if (certificates.length === 0) {
    return { current: null, historical: [] };
  }

  const enrolledAtMs = enrolledAt ? new Date(enrolledAt).getTime() : 0;
  const sorted = [...certificates].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );

  const currentAttemptCerts = sorted.filter(
    (cert) => new Date(cert.issuedAt).getTime() >= enrolledAtMs,
  );
  const historicalCerts = sorted.filter((cert) => new Date(cert.issuedAt).getTime() < enrolledAtMs);

  return {
    current: currentAttemptCerts[0] ?? null,
    historical: [...currentAttemptCerts.slice(1), ...historicalCerts],
  };
}

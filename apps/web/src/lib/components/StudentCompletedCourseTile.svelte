<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { splitCertificatesByAttempt } from '$lib/certificate-attempts';
  import { certificateDownloadFileName, certificateDownloadUrl, formatCertificateIssuedAt } from '$lib/certificate-download';

  type CertificateItem = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
  };

  type CompletedCourse = {
    id: string;
    title: string;
    description?: string;
    completedAt?: string;
    enrolledAt?: string;
    enrollmentStatus?: string;
    progressPercent?: number;
    certificates?: CertificateItem[];
    certificate?: CertificateItem | null;
    canOpenCourse?: boolean;
  };

  let {
    course,
    onOpenHistory,
  }: {
    course: CompletedCourse;
    onOpenHistory?: (courseTitle: string, certificates: CertificateItem[]) => void;
  } = $props();

  const canOpen = $derived(course.canOpenCourse === true);
  const certificates = $derived(course.certificates ?? (course.certificate ? [course.certificate] : []));
  const certificateSplit = $derived(splitCertificatesByAttempt(certificates, course.enrolledAt));
  const currentCertificate = $derived(certificateSplit.current);
  const historicalCertificates = $derived(certificateSplit.historical);

  function formatDate(iso?: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString($locale, { dateStyle: 'medium' });
  }
</script>

<article class="completed-course-tile" class:completed-course-tile--locked={!canOpen}>
  <div class="completed-course-tile-head">
    <span class="status-chip status-chip--done">{t('courses.statusCompleted', $locale)}</span>
    {#if course.completedAt}
      <span class="completed-course-tile-date">{formatDate(course.completedAt)}</span>
    {/if}
  </div>

  <h3 class="completed-course-tile-title">
    {#if canOpen}
      <a href="/courses/{course.id}">{course.title}</a>
    {:else}
      <span>{course.title}</span>
    {/if}
  </h3>

  {#if course.description}
    <p class="completed-course-tile-desc">{course.description}</p>
  {/if}

  <div class="completed-course-tile-cert">
    {#if currentCertificate}
      <div class="completed-course-cert-inline">
        <span class="completed-course-cert-current">
          #{currentCertificate.certificateNumber} · {formatCertificateIssuedAt(currentCertificate.issuedAt, $locale)}
        </span>
        <a
          class="btn btn-ghost btn-sm completed-course-cert-download"
          href={certificateDownloadUrl(currentCertificate.id)}
          download={certificateDownloadFileName(currentCertificate.certificateNumber)}
        >
          {t('dash.downloadCertificate', $locale)}
        </a>
        {#if historicalCertificates.length > 0 && onOpenHistory}
          <button
            type="button"
            class="completed-course-cert-history-btn"
            title="{t('dash.olderCertificates', $locale)} ({historicalCertificates.length})"
            aria-label="{t('dash.olderCertificates', $locale)} ({historicalCertificates.length})"
            onclick={() => onOpenHistory(course.title, historicalCertificates)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
              <path d="M6 11v4.5c0 1.8 2.7 3 6 3s6-1.2 6-3V11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
              <path d="M22 8v5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
            </svg>
            <span class="completed-course-cert-history-count">{historicalCertificates.length}</span>
          </button>
        {/if}
      </div>
    {:else if historicalCertificates.length > 0 && onOpenHistory}
      <div class="completed-course-cert-inline">
        <span class="completed-course-cert-empty">—</span>
        <button
          type="button"
          class="completed-course-cert-history-btn"
          title="{t('dash.olderCertificates', $locale)} ({historicalCertificates.length})"
          aria-label="{t('dash.olderCertificates', $locale)} ({historicalCertificates.length})"
          onclick={() => onOpenHistory(course.title, historicalCertificates)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
            <path d="M6 11v4.5c0 1.8 2.7 3 6 3s6-1.2 6-3V11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
            <path d="M22 8v5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
          </svg>
          <span class="completed-course-cert-history-count">{historicalCertificates.length}</span>
        </button>
      </div>
    {:else}
      <span class="completed-course-cert-empty">—</span>
    {/if}
  </div>

  {#if canOpen}
    <a href="/courses/{course.id}" class="btn btn-sm completed-course-tile-action">{t('courses.open', $locale)} →</a>
  {:else}
    <span class="completed-course-tile-access-closed">{t('courses.accessClosed', $locale)}</span>
  {/if}
</article>

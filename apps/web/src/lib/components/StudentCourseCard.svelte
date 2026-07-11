<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { certificateDownloadFileName, certificateDownloadUrl, formatCertificateIssuedAt } from '$lib/certificate-download';
  import '$lib/styles/dashboard.css';

  type CourseItem = {
    id: string;
    title: string;
    description?: string;
    progressPercent?: number;
    startsAt?: string;
    endsAt?: string;
    completedAt?: string;
    certificate?: { id: string; certificateNumber: string; issuedAt: string } | null;
    enrollmentStatus?: string;
    canOpenCourse?: boolean;
  };

  let {
    course,
    variant = 'active',
  }: {
    course: CourseItem;
    variant?: 'active' | 'future' | 'past';
  } = $props();

  const canOpen = $derived(course.canOpenCourse === true);

  function formatDate(iso?: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString($locale, { dateStyle: 'medium' });
  }

  function formatDateTime(iso?: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function futureAvailabilityLabel() {
    if (!course.startsAt) return '';
    const from = formatDateTime(course.startsAt);
    const to = course.endsAt ? formatDateTime(course.endsAt) : t('courses.noEndDate', $locale);
    return t('courses.availablePeriod', $locale).replace('{from}', from).replace('{to}', to);
  }
</script>

<article
  class="course-card"
  class:course-card--future={variant === 'future'}
  class:course-card--past={variant === 'past'}
  class:course-card--locked={!canOpen}
>
  <div class="course-card-info">
    <h3>
      {#if canOpen}
        <a href="/courses/{course.id}">{course.title}</a>
      {:else}
        <span>{course.title}</span>
      {/if}
    </h3>
    {#if variant === 'future'}
      <span class="status-chip status-chip--planned">{t('courses.statusPlanned', $locale)}</span>
    {:else if course.enrollmentStatus === 'completed'}
      <span class="status-chip status-chip--done">{t('courses.statusCompleted', $locale)}</span>
    {:else if course.enrollmentStatus === 'active'}
      <span class="status-chip">{t('courses.statusActive', $locale)}</span>
    {:else if course.enrollmentStatus === 'suspended'}
      <span class="status-chip status-chip--suspended">{t('admin.enrollmentSuspended', $locale)}</span>
    {/if}
    {#if course.description}
      <p>{course.description}</p>
    {/if}

    {#if variant === 'future'}
      <span class="course-card-meta course-card-availability">{futureAvailabilityLabel()}</span>
    {:else if variant === 'past' && course.completedAt}
      <span class="course-card-meta">{t('courses.completedAt', $locale)}: {formatDate(course.completedAt)}</span>
    {:else if variant === 'active' && course.progressPercent !== undefined}
      <div class="progress-bar-wrap">
        <div class="progress-bar-label">
          <span>{t('course.progress', $locale)}</span>
          <span>{course.progressPercent}%</span>
        </div>
        <div class="progress-bar" class:progress-bar--frozen={!canOpen}>
          <div class="progress-bar-fill" style="width: {course.progressPercent}%"></div>
        </div>
      </div>
    {/if}

    {#if course.certificate}
      <div class="course-card-cert-inline">
        <span class="cert-badge">🏆 #{course.certificate.certificateNumber}</span>
        <span class="course-card-meta">{formatCertificateIssuedAt(course.certificate.issuedAt, $locale)}</span>
        <a
          class="btn btn-ghost btn-sm completed-course-cert-download"
          href={certificateDownloadUrl(course.certificate.id)}
          download={certificateDownloadFileName(course.certificate.certificateNumber)}
        >
          {t('dash.downloadCertificate', $locale)}
        </a>
      </div>
    {/if}

    {#if !canOpen && variant !== 'future'}
      <span class="course-card-meta course-card-access-closed">{t('courses.accessClosed', $locale)}</span>
    {:else if !canOpen && variant === 'future'}
      <span class="course-card-meta course-card-access-closed">{t('courses.opensLater', $locale)}</span>
    {/if}
  </div>
  {#if canOpen}
    <a href="/courses/{course.id}" class="btn btn-sm course-card-action">{t('courses.open', $locale)} →</a>
  {/if}
</article>

<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import '$lib/styles/dashboard.css';

  type CourseItem = {
    id: string;
    title: string;
    description?: string;
    progressPercent?: number;
    startsAt?: string;
    endsAt?: string;
    completedAt?: string;
    certificate?: { certificateNumber: string; issuedAt: string } | null;
    enrollmentStatus?: string;
  };

  let {
    course,
    variant = 'active',
  }: {
    course: CourseItem;
    variant?: 'active' | 'future' | 'past';
  } = $props();

  function formatDate(iso?: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString($locale, { dateStyle: 'medium' });
  }
</script>

<article class="course-card" class:course-card--future={variant === 'future'} class:course-card--past={variant === 'past'}>
  <div class="course-card-info">
    <h3><a href="/courses/{course.id}">{course.title}</a></h3>
    {#if course.description}
      <p>{course.description}</p>
    {/if}

    {#if variant === 'future' && course.startsAt}
      <span class="course-card-meta">{t('courses.startsAt', $locale)}: {formatDate(course.startsAt)}</span>
    {:else if variant === 'past' && course.completedAt}
      <span class="course-card-meta">{t('courses.completedAt', $locale)}: {formatDate(course.completedAt)}</span>
    {:else if variant === 'active' && course.progressPercent !== undefined}
      <div class="progress-bar-wrap">
        <div class="progress-bar-label">
          <span>{t('course.progress', $locale)}</span>
          <span>{course.progressPercent}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: {course.progressPercent}%"></div>
        </div>
      </div>
    {/if}

    {#if course.certificate}
      <span class="cert-badge">🏆 {course.certificate.certificateNumber}</span>
      <span class="course-card-meta">{formatDate(course.certificate.issuedAt)}</span>
    {/if}
  </div>
  <a href="/courses/{course.id}" class="btn btn-sm course-card-action">{t('courses.open', $locale)} →</a>
</article>

<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import {
    getCoursePublicationDisplayStatus,
    type CoursePublicationInput,
  } from '$lib/course-publish-status';

  let { course, variant = 'tree' }: { course: CoursePublicationInput; variant?: 'tree' | 'badge' } = $props();

  const status = $derived(getCoursePublicationDisplayStatus(course));
  const label = $derived(
    status === 'published'
      ? t('admin.courseStatusPublished', $locale)
      : status === 'scheduled'
        ? t('admin.courseStatusScheduled', $locale)
        : t('admin.courseStatusUnpublished', $locale),
  );
</script>

{#if variant === 'badge'}
  <span
    class="badge"
    class:badge-success={status === 'published'}
    class:badge-primary={status === 'scheduled'}
    class:badge-muted={status === 'unpublished'}
  >
    {label}
  </span>
{:else}
  <span
    class="cat-tree-badge"
    class:cat-tree-badge--live={status === 'published'}
    class:cat-tree-badge--scheduled={status === 'scheduled'}
  >
    {label}
  </span>
{/if}

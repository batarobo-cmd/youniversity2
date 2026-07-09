<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { lastMessage } from '$lib/stores/realtime';
  import StudentCourseCard from '$lib/components/StudentCourseCard.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/courses.css';
  import '$lib/styles/dashboard.css';

  type CourseItem = Record<string, unknown>;

  let { data }: { data: PageData } = $props();

  const futureCourses = $derived(data.overview.futureCourses as CourseItem[]);
  const activeCourses = $derived(data.overview.activeCourses as CourseItem[]);
  const pastCourses = $derived(data.overview.pastCourses as CourseItem[]);
  let loading = $state(false);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (admin) goto('/dashboard');
    });

    const unsubWs = lastMessage.subscribe((msg) => {
      if (msg?.type === WS_EVENTS.ENROLLMENT_CHANGED || msg?.type === WS_EVENTS.COURSE_UPDATED) {
        void refreshCourses();
      }
    });

    return () => {
      unsubAuth();
      unsubAdmin();
      unsubWs();
    };
  });

  async function refreshCourses() {
    loading = true;
    try {
      await invalidate('student:courses');
    } finally {
      loading = false;
    }
  }

  const hasAny = $derived(
    futureCourses.length + activeCourses.length + pastCourses.length > 0,
  );
</script>

<div class="page-header">
  <h1>{t('courses.title', $locale)}</h1>
  <p>{t('courses.subtitle', $locale)}</p>
</div>

{#if data.loadError}
  <div class="form-error">{data.loadError}</div>
{:else if loading}
  <p class="loading-text">...</p>
{:else if !hasAny}
  <div class="empty-state">{t('courses.empty', $locale)}</div>
{:else}
  <div class="courses-sections">
    <section class="courses-section panel">
      <div class="panel-header"><h2>{t('courses.sectionActive', $locale)}</h2></div>
      <div class="panel-body">
        {#if activeCourses.length === 0}
          <p class="courses-section-empty">{t('dash.noActiveCourses', $locale)}</p>
        {:else}
          <div class="student-courses-list">
            {#each activeCourses as course (course.id)}
              <StudentCourseCard {course} variant="active" />
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="courses-section panel">
      <div class="panel-header"><h2>{t('courses.sectionFuture', $locale)}</h2></div>
      <div class="panel-body">
        {#if futureCourses.length === 0}
          <p class="courses-section-empty">{t('courses.noFuture', $locale)}</p>
        {:else}
          <div class="student-courses-list">
            {#each futureCourses as course (course.id)}
              <StudentCourseCard {course} variant="future" />
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="courses-section panel">
      <div class="panel-header"><h2>{t('courses.sectionPast', $locale)}</h2></div>
      <div class="panel-body">
        {#if pastCourses.length === 0}
          <p class="courses-section-empty">{t('courses.noPast', $locale)}</p>
        {:else}
          <div class="student-courses-list">
            {#each pastCourses as course (course.id)}
              <StudentCourseCard {course} variant="past" />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
{/if}

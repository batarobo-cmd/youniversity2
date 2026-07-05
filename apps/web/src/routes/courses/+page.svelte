<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { lastMessage } from '$lib/stores/realtime';
  import '$lib/styles/courses.css';

  let courses = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });

    loadCourses();

    const unsubWs = lastMessage.subscribe((msg) => {
      if (msg?.type === WS_EVENTS.ENROLLMENT_CHANGED || msg?.type === WS_EVENTS.COURSE_UPDATED) {
        loadCourses();
      }
    });

    return () => {
      unsubAuth();
      unsubWs();
    };
  });

  async function loadCourses() {
    loading = true;
    try {
      courses = (await api.getCourses()) as Array<Record<string, unknown>>;
    } catch {
      courses = [];
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-header">
  <h1>{t('courses.title', $locale)}</h1>
</div>

{#if loading}
  <p class="loading-text">{t('courses.title', $locale)}...</p>
{:else if courses.length === 0}
  <div class="empty-state">{t('courses.empty', $locale)}</div>
{:else}
  <div class="courses-grid">
    {#each courses as course, i}
      <article class="course-tile" style="animation-delay: {i * 50}ms">
        <h3>{course.title as string}</h3>
        <p class="course-tile-desc">{(course.description as string)?.slice(0, 160)}</p>
        <div class="course-tile-footer">
          {#if course.isPublished}
            <span class="badge badge-success">Published</span>
          {:else}
            <span class="badge badge-warning">Draft</span>
          {/if}
          <a href="/courses/{course.id}" class="btn btn-sm">{t('courses.open', $locale)} →</a>
        </div>
      </article>
    {/each}
  </div>
{/if}

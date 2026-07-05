<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { lastMessage } from '$lib/stores/realtime';

  let courses = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/login');
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

<h1 style="margin-bottom: 1.5rem;">{t('courses.title', $locale)}</h1>

{#if loading}
  <p style="color: var(--color-muted);">Načítavam...</p>
{:else if courses.length === 0}
  <p style="color: var(--color-muted);">{t('courses.empty', $locale)}</p>
{:else}
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
    {#each courses as course}
      <div class="card">
        <h3 style="margin-bottom: 0.5rem;">{course.title as string}</h3>
        <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 1rem;">
          {(course.description as string)?.slice(0, 120)}...
        </p>
        {#if course.isPublished}
          <span class="badge badge-success">Published</span>
        {:else}
          <span class="badge badge-warning">Draft</span>
        {/if}
        <div style="margin-top: 1rem;">
          <a href="/courses/{course.id}" class="btn">{t('courses.open', $locale)}</a>
        </div>
      </div>
    {/each}
  </div>
{/if}

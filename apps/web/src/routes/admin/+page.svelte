<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { activityFeed, wsStatus } from '$lib/stores/realtime';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';

  let courses = $state<Array<Record<string, unknown>>>([]);
  let selectedCourseId = $state('');
  let enrollments = $state<Array<Record<string, unknown>>>([]);
  let historicalActivity = $state<Array<Record<string, unknown>>>([]);

  onMount(() => {
    const unsub = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/login');
    });

    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (!admin) goto('/courses');
    });

    loadCourses();

    return () => {
      unsub();
      unsubAdmin();
    };
  });

  async function loadCourses() {
    courses = (await api.getCourses()) as Array<Record<string, unknown>>;
    if (courses.length > 0 && !selectedCourseId) {
      selectedCourseId = courses[0].id as string;
      await loadCourseData(selectedCourseId);
    }
  }

  async function loadCourseData(courseId: string) {
    selectedCourseId = courseId;
    enrollments = (await api.getEnrollments(courseId)) as Array<Record<string, unknown>>;
    historicalActivity = (await api.getActivity(courseId)) as Array<Record<string, unknown>>;
  }
</script>

<h1 style="margin-bottom: 1.5rem;">{t('nav.admin', $locale)}</h1>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
  <section>
    <div class="card" style="margin-bottom: 1rem;">
      <label for="course-select">Kurz</label>
      <select
        id="course-select"
        value={selectedCourseId}
        onchange={(e) => loadCourseData((e.target as HTMLSelectElement).value)}
        style="margin-top: 0.5rem;"
      >
        {#each courses as course}
          <option value={course.id as string}>{course.title as string}</option>
        {/each}
      </select>
    </div>

    <div class="card">
      <h2 style="font-size: 1rem; margin-bottom: 1rem;">Enrollments ({enrollments.length})</h2>
      {#if enrollments.length === 0}
        <p style="color: var(--color-muted); font-size: 0.9rem;">Žiadne enrollmenty.</p>
      {:else}
        <ul style="list-style: none;">
          {#each enrollments as item}
            {@const enrollment = item.enrollment as Record<string, unknown>}
            {@const u = item.user as Record<string, unknown>}
            <li style="padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); font-size: 0.9rem;">
              <strong>{u.name as string}</strong> — {u.email as string}
              <span class="badge badge-warning" style="margin-left: 0.5rem;">{enrollment.status as string}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="font-size: 1rem;">{t('admin.activity', $locale)}</h2>
      <span class="badge {$wsStatus === 'connected' ? 'badge-success' : 'badge-danger'}">
        {$wsStatus === 'connected' ? t('realtime.connected', $locale) : t('realtime.disconnected', $locale)}
      </span>
    </div>

    <div style="max-height: 400px; overflow-y: auto;">
      {#if $activityFeed.length === 0 && historicalActivity.length === 0}
        <p style="color: var(--color-muted); font-size: 0.9rem;">Čakám na aktivitu študentov...</p>
      {/if}

      {#each $activityFeed as item}
        <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); font-size: 0.85rem;">
          <strong>{item.userName}</strong>
          <span style="color: var(--color-muted);"> — {item.eventType}</span>
          <span style="float: right; color: var(--color-muted);">{item.time}</span>
        </div>
      {/each}

      {#each historicalActivity.slice().reverse() as event}
        <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); font-size: 0.85rem; opacity: 0.7;">
          <span style="color: var(--color-muted);">{event.eventType as string}</span>
          <span style="float: right; color: var(--color-muted);">
            {new Date(event.createdAt as string).toLocaleTimeString()}
          </span>
        </div>
      {/each}
    </div>
  </section>
</div>

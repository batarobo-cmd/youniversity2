<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isAuthenticated, locale, isAdmin } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { joinCourse, trackActivity, lastMessage } from '$lib/stores/realtime';
  import { WS_EVENTS } from '@youniversity2/shared';
  import '$lib/styles/courses.css';

  let course = $state<Record<string, unknown> | null>(null);
  let progress = $state<Array<Record<string, unknown>>>([]);
  let activeLesson = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);

  const courseId = $derived($page.params.id);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });

    loadCourse();
    joinCourse(courseId);
    trackActivity('course.opened', courseId);

    const unsubWs = lastMessage.subscribe((msg) => {
      if (!msg) return;
      if (
        msg.type === WS_EVENTS.COURSE_UPDATED ||
        msg.type === WS_EVENTS.PROGRESS_UPDATED ||
        msg.type === WS_EVENTS.COMPLETION_EVALUATED
      ) {
        loadCourse();
      }
    });

    return () => {
      unsubAuth();
      unsubWs();
    };
  });

  async function loadCourse() {
    loading = true;
    try {
      course = await api.getCourse(courseId);
      progress = (await api.getCourseProgress(courseId)) as Array<Record<string, unknown>>;
    } catch {
      course = null;
    } finally {
      loading = false;
    }
  }

  function getLessonProgress(lessonId: string) {
    return progress.find((p) => p.lessonId === lessonId);
  }

  async function openLesson(lesson: Record<string, unknown>) {
    activeLesson = lesson;
    trackActivity('lesson.opened', courseId, lesson.id as string, { type: lesson.type });
  }

  async function markComplete(lessonId: string) {
    await api.updateProgress({ lessonId, isComplete: true, percentComplete: 100 });
    trackActivity('lesson.completed', courseId, lessonId);
    progress = (await api.getCourseProgress(courseId)) as Array<Record<string, unknown>>;
  }

  async function translateCourse(targetLocale: string) {
    await api.translateCourse(courseId, targetLocale);
    await loadCourse();
  }
</script>

{#if loading}
  <p class="loading-text">Načítavam kurz...</p>
{:else if !course}
  <div class="empty-state">Kurz nebol nájdený.</div>
{:else}
  <div class="course-layout">
    <aside class="course-sidebar">
      <div class="course-sidebar-header">
        <h1>{course.title as string}</h1>
        <p>{course.description as string}</p>
      </div>

      {#if $isAdmin}
        <div class="course-admin-actions">
          <button class="btn btn-ghost btn-sm" onclick={() => translateCourse('en')}>
            {t('admin.translate', $locale)} → EN
          </button>
          <button class="btn btn-ghost btn-sm" onclick={() => translateCourse('de')}>
            {t('admin.translate', $locale)} → DE
          </button>
        </div>
      {/if}

      <h2 style="font-size: 0.75rem; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.75rem;">
        {t('course.modules', $locale)}
      </h2>

      {#each (course.modules as Array<Record<string, unknown>>) ?? [] as mod}
        <div class="module-block">
          <h3>{mod.title as string}</h3>
          {#each (mod.lessons as Array<Record<string, unknown>>) ?? [] as lesson}
            {@const prog = getLessonProgress(lesson.id as string)}
            <button
              class="lesson-btn"
              class:active={activeLesson?.id === lesson.id}
              onclick={() => openLesson(lesson)}
            >
              {lesson.title as string}
              {#if prog?.isComplete}
                <span class="check">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </aside>

    <section class="lesson-content-panel">
      {#if activeLesson}
        <h2>{activeLesson.title as string}</h2>

        {#if activeLesson.type === 'embed' || activeLesson.type === 'video'}
          {@const config = activeLesson.config as Record<string, unknown>}
          {#if config.embedUrl}
            <div class="video-wrap">
              <iframe
                src={config.embedUrl as string}
                title={activeLesson.title as string}
                allowfullscreen
              ></iframe>
            </div>
          {/if}
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako dokončené</button>
        {:else if activeLesson.type === 'quiz'}
          <p style="margin-bottom: 1.25rem; color: var(--color-text-secondary); font-size: 0.9375rem;">
            Test — MVP verzia. Kliknite pre simuláciu úspešného testu (skóre 85%).
          </p>
          <button
            onclick={async () => {
              await api.updateProgress({
                lessonId: activeLesson!.id as string,
                isComplete: true,
                score: 85,
              });
              trackActivity('quiz.completed', courseId, activeLesson!.id as string, { score: 85 });
              progress = (await api.getCourseProgress(courseId)) as Array<Record<string, unknown>>;
            }}
          >
            Odoslať test (demo)
          </button>
        {:else}
          <div style="margin-bottom: 1.25rem; line-height: 1.7; color: var(--color-text-secondary);">
            {(activeLesson.content as string) ?? 'Obsah lekcie.'}
          </div>
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako prečítané</button>
        {/if}
      {:else}
        <p class="empty-hint">Vyberte lekciu zo zoznamu vľavo.</p>
      {/if}
    </section>
  </div>
{/if}

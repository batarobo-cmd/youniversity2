<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isAuthenticated, locale, isAdmin } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { joinCourse, trackActivity, lastMessage } from '$lib/stores/realtime';
  import { WS_EVENTS } from '@youniversity2/shared';

  let course = $state<Record<string, unknown> | null>(null);
  let progress = $state<Array<Record<string, unknown>>>([]);
  let activeLesson = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);

  const courseId = $derived($page.params.id);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/login');
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
  <p style="color: var(--color-muted);">Načítavam kurz...</p>
{:else if !course}
  <p>Kurz nebol nájdený.</p>
{:else}
  <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem;">
    <aside>
      <h1 style="font-size: 1.5rem; margin-bottom: 0.5rem;">{course.title as string}</h1>
      <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
        {course.description as string}
      </p>

      {#if $isAdmin}
        <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button onclick={() => translateCourse('en')}>{t('admin.translate', $locale)} → EN</button>
          <button onclick={() => translateCourse('de')}>{t('admin.translate', $locale)} → DE</button>
        </div>
      {/if}

      <h2 style="font-size: 1rem; margin-bottom: 0.75rem;">{t('course.modules', $locale)}</h2>

      {#each (course.modules as Array<Record<string, unknown>>) ?? [] as mod}
        <div class="card" style="margin-bottom: 0.75rem; padding: 0.75rem;">
          <h3 style="font-size: 0.95rem; margin-bottom: 0.5rem;">{mod.title as string}</h3>
          {#each (mod.lessons as Array<Record<string, unknown>>) ?? [] as lesson}
            {@const prog = getLessonProgress(lesson.id as string)}
            <button
              onclick={() => openLesson(lesson)}
              style="display: block; width: 100%; text-align: left; margin-bottom: 0.25rem; background: {activeLesson?.id === lesson.id ? 'var(--color-primary)' : 'transparent'}; border: 1px solid var(--color-border); color: var(--color-text); padding: 0.4rem 0.6rem; font-size: 0.85rem;"
            >
              {lesson.title as string}
              {#if prog?.isComplete}
                <span style="float: right;">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </aside>

    <section class="card">
      {#if activeLesson}
        <h2 style="margin-bottom: 1rem;">{activeLesson.title as string}</h2>

        {#if activeLesson.type === 'embed' || activeLesson.type === 'video'}
          {@const config = activeLesson.config as Record<string, unknown>}
          {#if config.embedUrl}
            <div style="position: relative; padding-bottom: 56.25%; height: 0; margin-bottom: 1rem;">
              <iframe
                src={config.embedUrl as string}
                title={activeLesson.title as string}
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: var(--radius);"
                allowfullscreen
              ></iframe>
            </div>
          {/if}
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako dokončené</button>
        {:else if activeLesson.type === 'quiz'}
          <p style="margin-bottom: 1rem;">Test — MVP verzia. Kliknite pre simuláciu úspešného testu (skóre 85%).</p>
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
          <div style="margin-bottom: 1rem;">
            {(activeLesson.content as string) ?? 'Obsah lekcie.'}
          </div>
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako prečítané</button>
        {/if}
      {:else}
        <p style="color: var(--color-muted);">Vyberte lekciu zo zoznamu vľavo.</p>
      {/if}
    </section>
  </div>
{/if}

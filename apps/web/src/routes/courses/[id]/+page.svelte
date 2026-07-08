<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isAuthenticated, locale, isAdmin } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { joinCourse, trackActivity, lastMessage } from '$lib/stores/realtime';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { moduleActivities, normalizeActivityType } from '$lib/activity-types';
  import '$lib/styles/courses.css';

  let course = $state<Record<string, unknown> | null>(null);
  let progress = $state<Array<Record<string, unknown>>>([]);
  let activeLesson = $state<Record<string, unknown> | null>(null);
  let activeModuleId = $state<string | null>(null);
  let loading = $state(true);

  const courseId = $derived($page.params.id);

  $effect(() => {
    const id = courseId;
    if (!id) return;
    activeLesson = null;
    activeModuleId = null;
    joinCourse(id);
    trackActivity('course.opened', id);
    void loadCourse(id);
  });

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });

    const unsubWs = lastMessage.subscribe((msg) => {
      if (!msg) return;
      if (
        msg.type === WS_EVENTS.COURSE_UPDATED ||
        msg.type === WS_EVENTS.PROGRESS_UPDATED ||
        msg.type === WS_EVENTS.COMPLETION_EVALUATED
      ) {
        loadCourse(courseId);
      }
    });

    return () => {
      unsubAuth();
      unsubWs();
    };
  });

  async function loadCourse(id = courseId) {
    loading = true;
    try {
      course = await api.getCourse(id);
      progress = (await api.getCourseProgress(id)) as Array<Record<string, unknown>>;
    } catch {
      course = null;
    } finally {
      loading = false;
    }
  }

  function getLessonProgress(lessonId: string) {
    return progress.find((p) => p.lessonId === lessonId);
  }

  function activityType(lesson: Record<string, unknown>) {
    return normalizeActivityType(lesson.type as string);
  }

  function sortedModuleActivities(mod: Record<string, unknown>) {
    return [...moduleActivities(mod)].sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
    );
  }

  function sortedModules() {
    return [...((course?.modules as Array<Record<string, unknown>>) ?? [])].sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
    );
  }

  function moduleTextBlocks(mod: Record<string, unknown>) {
    return sortedModuleActivities(mod).filter((item) => activityType(item) === 'text');
  }

  function isTextOnlyModule(mod: Record<string, unknown>) {
    const activities = sortedModuleActivities(mod);
    return activities.length > 0 && activities.every((item) => activityType(item) === 'text');
  }

  function firstSelectable():
    | { kind: 'module'; mod: Record<string, unknown> }
    | { kind: 'lesson'; lesson: Record<string, unknown> }
    | null {
    for (const mod of sortedModules()) {
      if (isTextOnlyModule(mod)) return { kind: 'module', mod };
      const lesson = sortedModuleActivities(mod).find((item) => activityType(item) !== 'text');
      if (lesson) return { kind: 'lesson', lesson };
    }
    return null;
  }

  $effect(() => {
    if (!course || loading || activeLesson || activeModuleId) return;
    const first = firstSelectable();
    if (first?.kind === 'module') activeModuleId = first.mod.id as string;
    else if (first?.kind === 'lesson') activeLesson = first.lesson;
  });

  async function openModule(mod: Record<string, unknown>) {
    activeModuleId = mod.id as string;
    activeLesson = null;
    trackActivity('module.opened', courseId, mod.id as string);
  }

  async function openLesson(lesson: Record<string, unknown>) {
    activeLesson = lesson;
    activeModuleId = null;
    trackActivity('lesson.opened', courseId, lesson.id as string, { type: lesson.type });
  }

  async function markComplete(lessonId: string) {
    await api.updateProgress({ lessonId, isComplete: true, percentComplete: 100 });
    trackActivity('lesson.completed', courseId, lessonId);
    progress = (await api.getCourseProgress(courseId)) as Array<Record<string, unknown>>;
  }

  async function submitTest(lessonId: string) {
    await api.updateProgress({
      lessonId,
      isComplete: true,
      score: 85,
      percentComplete: 100,
    });
    trackActivity('quiz.completed', courseId, lessonId, { score: 85 });
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
        {t('course.activities', $locale)}
      </h2>

      {#each sortedModules() as mod}
        {#if isTextOnlyModule(mod)}
          <button
            type="button"
            class="module-block module-block--clickable"
            class:active={activeModuleId === mod.id}
            onclick={() => openModule(mod)}
          >
            <h3>{mod.title as string}</h3>
          </button>
        {:else}
          <div class="module-block">
            <h3>{mod.title as string}</h3>
            {#each sortedModuleActivities(mod) as lesson}
              {@const prog = getLessonProgress(lesson.id as string)}
              {@const type = activityType(lesson)}
              {#if type !== 'text'}
                <button
                  class="lesson-btn"
                  class:active={activeLesson?.id === lesson.id}
                  onclick={() => openLesson(lesson)}
                >
                  <span class="lesson-btn-type">{t(`activity.type.${type}`, $locale)}</span>
                  {lesson.title as string}
                  {#if prog?.isComplete}
                    <span class="check">✓</span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
    </aside>

    <section class="lesson-content-panel">
      {#if activeModuleId}
        {@const mod = sortedModules().find((item) => item.id === activeModuleId)}
        {#if mod}
          <h2>{mod.title as string}</h2>
          {#each moduleTextBlocks(mod) as textBlock}
            <div class="course-text-field-block">
              {#if textBlock.content}
                <div class="course-text-field-content">{textBlock.content as string}</div>
              {:else}
                <p class="empty-hint">{t('admin.textFieldEmpty', $locale)}</p>
              {/if}
            </div>
          {:else}
            <p class="empty-hint">{t('admin.textFieldEmpty', $locale)}</p>
          {/each}
        {/if}
      {:else if activeLesson}
        {@const type = activityType(activeLesson)}
        {@const config = (activeLesson.config as Record<string, unknown>) ?? {}}

        <h2>{activeLesson.title as string}</h2>

        {#if type !== 'certificate' && activeLesson.content}
          <div class="lesson-text-content activity-description">{activeLesson.content as string}</div>
        {/if}

        {#if type === 'video'}
          {#if config.embedUrl || config.videoUrl}
            <div class="video-wrap">
              {#if config.embedUrl}
                <iframe
                  src={config.embedUrl as string}
                  title={activeLesson.title as string}
                  allowfullscreen
                ></iframe>
              {:else}
                <video src={config.videoUrl as string} controls class="course-native-video">
                  <track kind="captions" />
                </video>
              {/if}
            </div>
          {:else}
            <p class="empty-hint">Video zatiaľ nemá nastavenú URL.</p>
          {/if}
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako dokončené</button>
        {:else if type === 'audio'}
          {#if config.audioUrl}
            <audio src={config.audioUrl as string} controls class="course-audio-player"></audio>
          {:else}
            <p class="empty-hint">Audio nahrávka zatiaľ nemá nastavenú URL.</p>
          {/if}
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako dokončené</button>
        {:else if type === 'presentation'}
          {#if config.presentationUrl}
            <p>
              <a href={config.presentationUrl as string} target="_blank" rel="noopener noreferrer">
                Otvoriť prezentáciu
              </a>
            </p>
          {/if}
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako prečítané</button>
        {:else if type === 'test'}
          <p style="margin-bottom: 1.25rem; color: var(--color-text-secondary); font-size: 0.9375rem;">
            Test — MVP verzia. Kliknite pre simuláciu úspešného testu (skóre 85 %).
          </p>
          <button onclick={() => submitTest(activeLesson!.id as string)}>Odoslať test (demo)</button>
        {:else if type === 'certificate'}
          <div class="lesson-certificate-preview">
            <p>{(activeLesson.content as string) || 'Gratulujeme! Po splnení podmienok kurzu získate certifikát.'}</p>
          </div>
          <button onclick={() => markComplete(activeLesson!.id as string)}>Pokračovať</button>
        {:else}
          <div class="lesson-text-content">
            {(activeLesson.content as string) ?? 'Obsah aktivity.'}
          </div>
          <button onclick={() => markComplete(activeLesson!.id as string)}>Označiť ako prečítané</button>
        {/if}
      {:else}
        <p class="empty-hint">Vyberte aktivitu zo zoznamu vľavo.</p>
      {/if}
    </section>
  </div>
{/if}

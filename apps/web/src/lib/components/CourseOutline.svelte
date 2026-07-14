<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import {
    moduleActivities,
    normalizeActivityType,
    countsForCourseCompletion,
    isProgressFullyComplete,
  } from '$lib/activity-types';

  type CourseRecord = Record<string, unknown>;
  type ProgressRecord = Record<string, unknown>;

  let {
    course,
    progress,
    activeLesson = null,
    activeModuleId = null,
    showStaffNav = false,
    mobileOpen = $bindable(false),
    onOpenLesson,
    onOpenModule,
    onTranslate,
  }: {
    course: CourseRecord;
    progress: ProgressRecord[];
    activeLesson?: CourseRecord | null;
    activeModuleId?: string | null;
    showStaffNav?: boolean;
    mobileOpen?: boolean;
    onOpenLesson: (lesson: CourseRecord) => void;
    onOpenModule: (mod: CourseRecord) => void;
    onTranslate?: (targetLocale: string) => void;
  } = $props();

  let expandedModules = $state<Set<string>>(new Set());
  let activeLessonEl: HTMLButtonElement | null = $state(null);
  let isMobile = $state(false);

  function activeLessonRef(node: HTMLButtonElement, active: boolean) {
    if (active) activeLessonEl = node;
    return {
      update(next: boolean) {
        if (next) activeLessonEl = node;
        else if (activeLessonEl === node) activeLessonEl = null;
      },
      destroy() {
        if (activeLessonEl === node) activeLessonEl = null;
      },
    };
  }

  const sidebarCourseState = $derived(courseCompletion());

  function sortedModules() {
    return [...((course?.modules as CourseRecord[]) ?? [])].sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
    );
  }

  function sortedModuleActivities(mod: CourseRecord) {
    return [...moduleActivities(mod)].sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
    );
  }

  function activityType(lesson: CourseRecord) {
    return normalizeActivityType(lesson.type as string);
  }

  function getLessonProgress(lessonId: string) {
    return progress.find((p) => p.lessonId === lessonId);
  }

  function isLessonComplete(lessonId: string) {
    return isProgressFullyComplete(getLessonProgress(lessonId));
  }

  function lessonProgressPercent(lessonId: string) {
    const prog = getLessonProgress(lessonId);
    if (isProgressFullyComplete(prog)) return 100;
    return Math.max(0, Math.min(99, Number(prog?.percentComplete ?? 0)));
  }

  function selectableActivities(mod: CourseRecord) {
    return sortedModuleActivities(mod).filter((item) => activityType(item) !== 'text');
  }

  function requiredActivities(mod: CourseRecord) {
    return selectableActivities(mod).filter((item) =>
      countsForCourseCompletion(item as { type?: string; isRequired?: boolean }),
    );
  }

  function moduleCompletion(mod: CourseRecord) {
    const activities = requiredActivities(mod);
    const total = activities.length;
    const completed = activities.filter((a) => isLessonComplete(a.id as string)).length;
    return { total, completed, done: total > 0 && completed === total };
  }

  function courseCompletion() {
    const allActivities = sortedModules().flatMap((mod) => requiredActivities(mod));
    const total = allActivities.length;
    const completed = allActivities.filter((a) => isLessonComplete(a.id as string)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent, done: total > 0 && completed === total };
  }

  function isTextOnlyModule(mod: CourseRecord) {
    const activities = sortedModuleActivities(mod);
    return activities.length > 0 && activities.every((item) => activityType(item) === 'text');
  }

  function moduleIdForSelection(): string | null {
    if (activeModuleId) return activeModuleId as string;
    if (activeLesson) {
      for (const mod of sortedModules()) {
        if (sortedModuleActivities(mod).some((item) => item.id === activeLesson?.id)) {
          return mod.id as string;
        }
      }
    }
    return null;
  }

  function isModuleExpanded(modId: string) {
    return expandedModules.has(modId);
  }

  function toggleModule(modId: string) {
    const next = new Set(expandedModules);
    if (next.has(modId)) next.delete(modId);
    else next.add(modId);
    expandedModules = next;
  }

  function expandModule(modId: string) {
    if (expandedModules.has(modId)) return;
    expandedModules = new Set([...expandedModules, modId]);
  }

  function handleLessonClick(lesson: CourseRecord) {
    for (const mod of sortedModules()) {
      if (sortedModuleActivities(mod).some((item) => item.id === lesson.id)) {
        expandModule(mod.id as string);
        break;
      }
    }
    onOpenLesson(lesson);
    if (isMobile) mobileOpen = false;
  }

  function handleModuleClick(mod: CourseRecord) {
    onOpenModule(mod);
    if (isMobile) mobileOpen = false;
  }

  $effect(() => {
    const id = moduleIdForSelection();
    if (id) expandModule(id);
  });

  $effect(() => {
    activeLesson?.id;
    activeModuleId;
    queueMicrotask(() => {
      activeLessonEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  onMount(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      isMobile = mq.matches;
      if (!isMobile) mobileOpen = false;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
</script>

{#if isMobile && !mobileOpen}
  <button
    type="button"
    class="course-outline-mobile-toggle"
    aria-expanded={mobileOpen}
    onclick={() => (mobileOpen = true)}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
      />
    </svg>
    {t('course.outlineToggle', $locale)}
    <span class="course-outline-mobile-toggle__meta">
      {sidebarCourseState.percent}%
    </span>
  </button>
{/if}

{#if isMobile && mobileOpen}
  <button
    type="button"
    class="course-outline-backdrop"
    aria-label={t('course.outlineClose', $locale)}
    onclick={() => (mobileOpen = false)}
  ></button>
{/if}

<aside
  class="course-sidebar"
  class:course-sidebar--mobile-open={isMobile && mobileOpen}
  aria-label={t('course.outline', $locale)}
>
  {#if isMobile}
    <div class="course-outline-mobile-head">
      <h2>{t('course.outline', $locale)}</h2>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => (mobileOpen = false)}
      >
        {t('course.outlineClose', $locale)}
      </button>
    </div>
  {/if}

  <div class="course-sidebar-header">
    <h1>{course.title as string}</h1>
    {#if course.description}
      <p>{course.description as string}</p>
    {/if}
    <div class="course-inline-progress">
      <div class="course-inline-progress__label">
        <span>{t('course.progress', $locale)}</span>
        <span>{sidebarCourseState.completed}/{sidebarCourseState.total} ({sidebarCourseState.percent}%)</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: {sidebarCourseState.percent}%"></div>
      </div>
      {#if sidebarCourseState.done}
        <span class="course-complete-chip">✓ {t('courses.statusCompleted', $locale)}</span>
      {/if}
    </div>
  </div>

  {#if showStaffNav && onTranslate}
    <div class="course-admin-actions">
      <button class="btn btn-ghost btn-sm" type="button" onclick={() => onTranslate('en')}>
        {t('admin.translate', $locale)} → EN
      </button>
      <button class="btn btn-ghost btn-sm" type="button" onclick={() => onTranslate('de')}>
        {t('admin.translate', $locale)} → DE
      </button>
    </div>
  {/if}

  <nav class="course-outline" aria-label={t('course.activities', $locale)}>
    {#each sortedModules() as mod (mod.id)}
      {#if isTextOnlyModule(mod)}
        <button
          type="button"
          class="course-outline-text-module"
          class:active={activeModuleId === mod.id}
          onclick={() => handleModuleClick(mod)}
        >
          <span class="course-outline-text-module__title">{mod.title as string}</span>
        </button>
      {:else}
        {@const modState = moduleCompletion(mod)}
        {@const modId = mod.id as string}
        {@const expanded = isModuleExpanded(modId)}
        <section class="course-outline-module" class:course-outline-module--expanded={expanded}>
          <button
            type="button"
            class="course-outline-module__head"
            aria-expanded={expanded}
            onclick={() => toggleModule(modId)}
          >
            <span class="course-outline-module__chevron" aria-hidden="true"></span>
            <span class="course-outline-module__title">{mod.title as string}</span>
            {#if modState.done}
              <span class="module-complete-chip">✓</span>
            {:else if modState.total > 0}
              <span class="module-progress-chip">{modState.completed}/{modState.total}</span>
            {/if}
          </button>

          {#if expanded}
            <ul class="course-outline-lessons">
              {#each sortedModuleActivities(mod) as lesson (lesson.id)}
                {@const type = activityType(lesson)}
                {#if type !== 'text'}
                  {@const lessonId = lesson.id as string}
                  {@const done = isLessonComplete(lessonId)}
                  {@const percent = lessonProgressPercent(lessonId)}
                  {@const isActive = activeLesson?.id === lesson.id}
                  <li>
                    <button
                      type="button"
                      class="course-outline-lesson"
                      class:course-outline-lesson--done={done}
                      class:active={isActive}
                      use:activeLessonRef={isActive}
                      onclick={() => handleLessonClick(lesson)}
                    >
                      <span
                        class="course-outline-lesson__ring"
                        class:course-outline-lesson__ring--done={done}
                        style="--lesson-progress: {percent}"
                        aria-hidden="true"
                      ></span>
                      <span class="course-outline-lesson__body">
                        <span class="course-outline-lesson__type">{t(`activity.type.${type}`, $locale)}</span>
                        <span class="course-outline-lesson__title">{lesson.title as string}</span>
                      </span>
                      {#if done}
                        <span class="course-outline-lesson__check" aria-hidden="true">✓</span>
                      {:else if percent > 0}
                        <span class="course-outline-lesson__percent">{percent}%</span>
                      {/if}
                    </button>
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    {/each}
  </nav>
</aside>

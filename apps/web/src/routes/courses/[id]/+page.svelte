<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, locale, isAdmin } from '$lib/stores/auth';
  import { serverMutate } from '$lib/client/form-action';
  import { t } from '$lib/i18n';
  import { joinCourse, trackActivity, lastMessage } from '$lib/stores/realtime';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { moduleActivities, normalizeActivityType, countsForCourseCompletion, isProgressFullyComplete } from '$lib/activity-types';
  import type { PageData } from './$types';
  import '$lib/styles/courses.css';

  declare global {
    interface Window {
      YT?: any;
      onYouTubeIframeAPIReady?: () => void;
      Vimeo?: { Player: new (element: HTMLIFrameElement) => any };
    }
  }

  let { data }: { data: PageData } = $props();

  let course = $state<Record<string, unknown> | null>(data.course);
  let progress = $state<Array<Record<string, unknown>>>(data.progress as Array<Record<string, unknown>>);
  let activeLesson = $state<Record<string, unknown> | null>(null);
  let activeModuleId = $state<string | null>(null);
  let loading = $state(false);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let videoIframe = $state<HTMLIFrameElement | null>(null);
  let videoSeekGuard = $state(false);
  let maxAllowedTime = $state(0);
  let syncingVideoProgress = $state(false);
  let lastVideoSyncAt = $state(0);
  let trackedWatchSeconds = $state(0);
  let lastObservedPlayerTime = $state<number | null>(null);
  let watchTickTimer = $state<number | null>(null);
  let currentVideoProvider = $state<'native' | 'youtube' | 'vimeo' | null>(null);
  let youtubePlayer: any = null;
  let vimeoPlayer: any = null;

  const VIDEO_PROGRESS_SYNC_MS = 1000;
  const WATCH_COMPLETE_TOLERANCE_S = 0.35;
  const WATCH_TICK_MS = 250;

  const courseId = $derived($page.params.id);

  $effect(() => {
    course = data.course;
    progress = data.progress as Array<Record<string, unknown>>;
  });

  $effect(() => {
    const id = courseId;
    if (!id) return;
    activeLesson = null;
    activeModuleId = null;
    joinCourse(id);
    trackActivity('course.opened', id);
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
        void refreshCourse();
      }
    });

    return () => {
      clearWatchTicking();
      youtubePlayer?.destroy?.();
      vimeoPlayer?.destroy?.();
      unsubAuth();
      unsubWs();
    };
  });

  async function refreshCourse() {
    loading = true;
    try {
      await invalidate('student:course');
    } finally {
      loading = false;
    }
  }

  function getLessonProgress(lessonId: string) {
    return progress.find((p) => p.lessonId === lessonId);
  }

  function videoCompletionMode(config: Record<string, unknown>) {
    if (config.videoCompletionMode === 'watch_to_end') return 'watch_to_end';
    if (config.videoCompletionMode === 'min_watch_time') return 'min_watch_time';
    return 'manual_confirm';
  }

  function isWatchToEndMode(config: Record<string, unknown>) {
    return videoCompletionMode(config) === 'watch_to_end';
  }

  function requiredWatchSeconds(config: Record<string, unknown>) {
    const raw = Number(config.videoRequiredWatchSeconds ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  }

  function effectiveVideoUrl(config: Record<string, unknown>) {
    if (typeof config.videoUrl === 'string' && config.videoUrl.trim()) return config.videoUrl as string;
    if (typeof config.embedUrl === 'string' && config.embedUrl.trim()) return config.embedUrl as string;
    return null;
  }

  function videoProvider(config: Record<string, unknown>) {
    if (typeof config.videoUrl === 'string' && config.videoUrl.trim()) return 'native' as const;
    const embed = typeof config.embedUrl === 'string' ? (config.embedUrl as string) : '';
    if (!embed) return null;
    if (embed.includes('youtube.com/embed/') || embed.includes('youtu.be/')) return 'youtube' as const;
    if (embed.includes('player.vimeo.com/video/')) return 'vimeo' as const;
    return null;
  }

  function embedUrlWithTracking(config: Record<string, unknown>) {
    const raw = typeof config.embedUrl === 'string' ? (config.embedUrl as string) : '';
    if (!raw) return raw;
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, '');
      if (host.includes('youtube.com')) {
        url.searchParams.set('enablejsapi', '1');
        url.searchParams.set('playsinline', '1');
        url.searchParams.set('rel', '0');
      } else if (host.includes('vimeo.com')) {
        url.searchParams.set('api', '1');
        url.searchParams.set('dnt', '1');
      }
      return url.toString();
    } catch {
      return raw;
    }
  }

  function canEnforceWatchToEnd(config: Record<string, unknown>) {
    return Boolean(typeof config.videoUrl === 'string' && config.videoUrl.trim());
  }

  function shouldShowManualVideoComplete(config: Record<string, unknown>) {
    return !shouldAutoCompleteByWatchTime(config);
  }

  function canTrackWatchTime(config: Record<string, unknown>) {
    const provider = videoProvider(config);
    return provider === 'native' || provider === 'youtube' || provider === 'vimeo';
  }

  function shouldAutoCompleteByWatchTime(config: Record<string, unknown>) {
    const required = requiredWatchSeconds(config);
    if (videoCompletionMode(config) === 'min_watch_time') return required > 0 && canTrackWatchTime(config);
    return isWatchToEndMode(config) && canEnforceWatchToEnd(config);
  }

  async function ensureYouTubeApi() {
    if (window.YT?.Player) return;
    await new Promise<void>((resolve) => {
      const existing = document.querySelector('script[data-yo2-yt]');
      if (existing) {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          prev?.();
          resolve();
        };
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.yo2Yt = '1';
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  async function ensureVimeoApi() {
    if (window.Vimeo?.Player) return;
    await new Promise<void>((resolve) => {
      const existing = document.querySelector('script[data-yo2-vimeo]');
      if (existing) {
        const check = window.setInterval(() => {
          if (window.Vimeo?.Player) {
            window.clearInterval(check);
            resolve();
          }
        }, 100);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://player.vimeo.com/api/player.js';
      script.async = true;
      script.dataset.yo2Vimeo = '1';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }

  function clearWatchTicking() {
    if (watchTickTimer !== null) {
      window.clearInterval(watchTickTimer);
      watchTickTimer = null;
    }
    lastObservedPlayerTime = null;
  }

  async function getPlayerCurrentTime() {
    if (currentVideoProvider === 'native') return Number(videoElement?.currentTime ?? 0);
    if (currentVideoProvider === 'youtube' && youtubePlayer?.getCurrentTime) {
      return Number(youtubePlayer.getCurrentTime() ?? 0);
    }
    if (currentVideoProvider === 'vimeo' && vimeoPlayer?.getCurrentTime) {
      return Number(await vimeoPlayer.getCurrentTime());
    }
    return 0;
  }

  async function getPlayerDuration() {
    if (currentVideoProvider === 'native') return Number(videoElement?.duration ?? 0);
    if (currentVideoProvider === 'youtube' && youtubePlayer?.getDuration) {
      return Number(youtubePlayer.getDuration() ?? 0);
    }
    if (currentVideoProvider === 'vimeo' && vimeoPlayer?.getDuration) {
      return Number(await vimeoPlayer.getDuration());
    }
    return 0;
  }

  function requiredWatchTarget(config: Record<string, unknown>, duration: number) {
    const explicit = requiredWatchSeconds(config);
    if (videoCompletionMode(config) === 'min_watch_time') {
      if (explicit <= 0) return 0;
      if (duration > 0) return Math.min(explicit, duration);
      return explicit;
    }
    if (isWatchToEndMode(config) && duration > 0) return Math.round(duration);
    return 0;
  }

  async function watchedSecondsForTarget(config: Record<string, unknown>) {
    if (videoCompletionMode(config) === 'min_watch_time') {
      return await getPlayerCurrentTime();
    }
    if (currentVideoProvider === 'native') return maxAllowedTime;
    return trackedWatchSeconds;
  }

  async function completeWatchLesson(lessonId: string) {
    if (isLessonComplete(lessonId) || syncingVideoProgress) return;
    await syncVideoProgress(lessonId, { percentComplete: 100, isComplete: true });
    clearWatchTicking();
    trackActivity('lesson.completed', courseId, lessonId);
    await invalidate('student:course');
  }

  function restoreWatchCounterFromProgress(config: Record<string, unknown>, prog?: Record<string, unknown>) {
    const percent = Number(prog?.percentComplete ?? 0);
    if (!Number.isFinite(percent) || percent <= 0) {
      trackedWatchSeconds = 0;
      return;
    }
    const duration = Number(videoElement?.duration ?? 0);
    const target = requiredWatchTarget(config, duration);
    if (target > 0) {
      trackedWatchSeconds = Math.round((Math.max(0, Math.min(100, percent)) / 100) * target);
      return;
    }
    trackedWatchSeconds = 0;
  }

  async function syncWatchState(lessonId: string, config: Record<string, unknown>, force = false) {
    const duration = await getPlayerDuration();
    const target = requiredWatchTarget(config, duration);
    if (!target) return;

    const watched = await watchedSecondsForTarget(config);
    if (watched + WATCH_COMPLETE_TOLERANCE_S >= target) {
      await completeWatchLesson(lessonId);
      return;
    }

    const normalized = Math.max(0, Math.min(watched, target));
    const percentComplete = Math.min(99, Math.round((normalized / target) * 100));
    const now = Date.now();
    if (!force && now - lastVideoSyncAt < VIDEO_PROGRESS_SYNC_MS) return;
    if (syncingVideoProgress) return;

    lastVideoSyncAt = now;
    await syncVideoProgress(lessonId, { percentComplete, isComplete: false });
  }

  function startWatchTicking(lessonId: string, config: Record<string, unknown>) {
    if (!shouldAutoCompleteByWatchTime(config) || watchTickTimer !== null) return;
    watchTickTimer = window.setInterval(async () => {
      const nowPos = await getPlayerCurrentTime();
      if (Number.isFinite(nowPos)) {
        if (lastObservedPlayerTime !== null) {
          const delta = nowPos - lastObservedPlayerTime;
          if (delta > 0 && delta <= 2.5) trackedWatchSeconds += delta;
        }
        lastObservedPlayerTime = nowPos;
      }
      await syncWatchState(lessonId, config);
    }, WATCH_TICK_MS);
  }

  async function bindEmbedPlayer(
    iframe: HTMLIFrameElement,
    lessonId: string,
    config: Record<string, unknown>,
    prog?: Record<string, unknown>,
  ) {
    currentVideoProvider = videoProvider(config);
    if (currentVideoProvider === 'youtube') {
      await ensureYouTubeApi();
      youtubePlayer?.destroy?.();
      youtubePlayer = new window.YT.Player(iframe, {
        events: {
          onReady: async () => {
            restoreWatchCounterFromProgress(config, prog);
            await syncWatchState(lessonId, config);
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === 1) startWatchTicking(lessonId, config);
            if (event.data === 2 || event.data === 0) clearWatchTicking();
            if (event.data === 0) void syncWatchState(lessonId, config, true);
          },
        },
      });
      return;
    }
    if (currentVideoProvider === 'vimeo') {
      await ensureVimeoApi();
      vimeoPlayer?.destroy?.();
      vimeoPlayer = new window.Vimeo.Player(iframe);
      restoreWatchCounterFromProgress(config, prog);
      vimeoPlayer.on('play', () => startWatchTicking(lessonId, config));
      vimeoPlayer.on('pause', () => clearWatchTicking());
      vimeoPlayer.on('ended', async () => {
        clearWatchTicking();
        await syncWatchState(lessonId, config, true);
      });
    }
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

  function selectableActivities(mod: Record<string, unknown>) {
    return sortedModuleActivities(mod).filter((item) => activityType(item) !== 'text');
  }

  function isLessonComplete(lessonId: string) {
    return isProgressFullyComplete(getLessonProgress(lessonId));
  }

  function requiredActivities(mod: Record<string, unknown>) {
    return selectableActivities(mod).filter((item) => countsForCourseCompletion(item as { type?: string; isRequired?: boolean }));
  }

  function moduleCompletion(mod: Record<string, unknown>) {
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

  const sidebarCourseState = $derived(courseCompletion());

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
    videoElement = null;
    videoIframe = null;
    clearWatchTicking();
    youtubePlayer?.destroy?.();
    vimeoPlayer?.destroy?.();
    youtubePlayer = null;
    vimeoPlayer = null;
    currentVideoProvider = null;
    trackedWatchSeconds = 0;
    maxAllowedTime = 0;
    videoSeekGuard = false;
    lastVideoSyncAt = 0;
  }

  async function openLesson(lesson: Record<string, unknown>) {
    if (activeLesson?.id === lesson.id) return;
    activeLesson = lesson;
    activeModuleId = null;
    trackActivity('lesson.opened', courseId, lesson.id as string, { type: lesson.type });
    videoElement = null;
    videoIframe = null;
    clearWatchTicking();
    youtubePlayer?.destroy?.();
    vimeoPlayer?.destroy?.();
    youtubePlayer = null;
    vimeoPlayer = null;
    currentVideoProvider = null;
    trackedWatchSeconds = 0;
    maxAllowedTime = 0;
    videoSeekGuard = false;
    lastVideoSyncAt = 0;
  }

  async function markComplete(lessonId: string) {
    await serverMutate('apiMutation', '/api/progress', 'POST', {
      lessonId,
      isComplete: true,
      percentComplete: 100,
    });
    trackActivity('lesson.completed', courseId, lessonId);
    await invalidate('student:course');
  }

  async function syncVideoProgress(lessonId: string, payload: { percentComplete: number; isComplete?: boolean }) {
    if (syncingVideoProgress) return;
    syncingVideoProgress = true;
    try {
      await serverMutate('apiMutation', '/api/progress', 'POST', {
        lessonId,
        percentComplete: payload.percentComplete,
        ...(payload.isComplete !== undefined ? { isComplete: payload.isComplete } : {}),
      });
    } finally {
      syncingVideoProgress = false;
    }
  }

  function bindVideoElement(node: HTMLVideoElement) {
    videoElement = node;
    currentVideoProvider = 'native';
    return {
      destroy() {
        if (videoElement === node) videoElement = null;
      },
    };
  }

  function bindVideoIframe(
    node: HTMLIFrameElement,
    param: {
      lessonId: string;
      config: Record<string, unknown>;
      prog?: Record<string, unknown>;
    },
  ) {
    videoIframe = node;
    void bindEmbedPlayer(node, param.lessonId, param.config, param.prog);
    return {
      destroy() {
        if (videoIframe === node) videoIframe = null;
      },
    };
  }

  function restoreVideoPosition(lessonId: string, prog?: Record<string, unknown>) {
    if (!videoElement || !activeLesson || activeLesson.id !== lessonId) return;
    const duration = Number(videoElement.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const fromProgress = Number(prog?.percentComplete ?? 0);
    const resumePercent = Math.max(0, Math.min(99, fromProgress));
    const resumeTime = (resumePercent / 100) * duration;
    if (resumeTime > 0 && Math.abs(videoElement.currentTime - resumeTime) > 2) {
      videoElement.currentTime = resumeTime;
    }
    maxAllowedTime = Math.max(maxAllowedTime, videoElement.currentTime);
  }

  async function handleVideoTimeUpdate(lessonId: string, config: Record<string, unknown>) {
    if (videoSeekGuard || !videoElement) return;
    const duration = Number(videoElement.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;
    maxAllowedTime = Math.max(maxAllowedTime, videoElement.currentTime);

    if (!shouldAutoCompleteByWatchTime(config)) return;
    await syncWatchState(lessonId, config);
  }

  function handleVideoSeeking(config: Record<string, unknown>) {
    if (!videoElement || !isWatchToEndMode(config) || !canEnforceWatchToEnd(config)) return;
    const target = videoElement.currentTime;
    if (target > maxAllowedTime + 0.8) {
      videoSeekGuard = true;
      videoElement.currentTime = maxAllowedTime;
      queueMicrotask(() => {
        videoSeekGuard = false;
      });
      return;
    }
    maxAllowedTime = Math.max(maxAllowedTime, target);
  }

  async function handleVideoEnded(lessonId: string, config: Record<string, unknown>) {
    maxAllowedTime = Number(videoElement?.duration ?? maxAllowedTime);
    clearWatchTicking();
    if (videoCompletionMode(config) === 'min_watch_time') {
      await syncWatchState(lessonId, config, true);
      return;
    }
    await syncVideoProgress(lessonId, { percentComplete: 100, isComplete: true });
    trackActivity('lesson.completed', courseId, lessonId);
    await invalidate('student:course');
  }

  async function submitTest(lessonId: string) {
    await serverMutate('apiMutation', '/api/progress', 'POST', {
      lessonId,
      isComplete: true,
      score: 85,
      percentComplete: 100,
    });
    trackActivity('quiz.completed', courseId, lessonId, { score: 85 });
    await invalidate('student:course');
  }

  async function translateCourse(targetLocale: string) {
    await serverMutate('apiMutation', `/api/courses/${courseId}/translate`, 'POST', { targetLocale });
    await invalidate('student:course');
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
            <h3 class="module-title-row">
              <span>{mod.title as string}</span>
              {#if moduleCompletion(mod).done}
                <span class="module-complete-chip">✓</span>
              {:else if moduleCompletion(mod).total > 0}
                <span class="module-progress-chip">{moduleCompletion(mod).completed}/{moduleCompletion(mod).total}</span>
              {/if}
            </h3>
            {#each sortedModuleActivities(mod) as lesson}
              {@const prog = getLessonProgress(lesson.id as string)}
              {@const type = activityType(lesson)}
              {#if type !== 'text'}
                <button
                  class="lesson-btn"
                  class:lesson-btn--done={prog?.isComplete}
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
          {@const lessonProgress = getLessonProgress(activeLesson.id as string)}
          {@const videoUrl = effectiveVideoUrl(config)}
          {@const requiresWatchToEnd = isWatchToEndMode(config)}
          {@const strictWatchMode = requiresWatchToEnd && canEnforceWatchToEnd(config)}
          {#if videoUrl}
            <div class="video-wrap">
              {#if typeof config.videoUrl === 'string' && config.videoUrl}
                <video
                  src={config.videoUrl as string}
                  controls
                  class="course-native-video"
                  use:bindVideoElement
                  controlsList={strictWatchMode ? 'nodownload noplaybackrate noremoteplayback' : undefined}
                  onloadedmetadata={() => {
                    restoreVideoPosition(activeLesson.id as string, lessonProgress);
                    restoreWatchCounterFromProgress(config, lessonProgress);
                  }}
                  onplay={() => startWatchTicking(activeLesson.id as string, config)}
                  ontimeupdate={() => handleVideoTimeUpdate(activeLesson.id as string, config)}
                  onpause={() => {
                    clearWatchTicking();
                    handleVideoTimeUpdate(activeLesson.id as string, config);
                  }}
                  onseeking={() => handleVideoSeeking(config)}
                  onended={() => handleVideoEnded(activeLesson.id as string, config)}
                >
                  <track kind="captions" />
                </video>
              {:else if config.embedUrl}
                <iframe
                  src={embedUrlWithTracking(config)}
                  title={activeLesson.title as string}
                  use:bindVideoIframe={{
                    lessonId: activeLesson.id as string,
                    config,
                    prog: lessonProgress,
                  }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              {/if}
            </div>
          {:else}
            <p class="empty-hint">Video zatiaľ nemá nastavenú URL.</p>
          {/if}
          {#if requiresWatchToEnd && !strictWatchMode}
            <p class="video-rule-warning">{t('admin.videoWatchNativeOnly', $locale)}</p>
          {/if}
          {#if shouldShowManualVideoComplete(config)}
            <button onclick={() => markComplete(activeLesson!.id as string)}>
              {t('course.videoManualConfirm', $locale)}
            </button>
          {:else}
            <p class="video-rule-note">{t('course.videoWatchToEndStudentHint', $locale)}</p>
          {/if}
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

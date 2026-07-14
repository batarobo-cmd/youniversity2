<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, locale, showStaffNav, user } from '$lib/stores/auth';
  import { serverMutate } from '$lib/client/form-action';
  import { t } from '$lib/i18n';
  import { joinCourse, trackActivity, lastMessage } from '$lib/stores/realtime';
  import { WS_EVENTS } from '@youniversity2/shared';
  import { moduleActivities, normalizeActivityType, isProgressFullyComplete } from '$lib/activity-types';
  import {
    buildPresentationView,
    isLegacyPptPresentation,
    isOdpPresentation,
    presentationCompletionMode,
    presentationProgressFromRecord,
    presentationSlideMinSeconds,
    presentationSlideMinOverrides,
    type PresentationViewMode,
  } from '$lib/presentation-config';
  import PresentationPptxViewer from '$lib/components/PresentationPptxViewer.svelte';
  import PresentationPdfViewer from '$lib/components/PresentationPdfViewer.svelte';
  import ScormPlayer, { type ScormFlushFn, type ScormSessionState } from '$lib/components/ScormPlayer.svelte';
  import CourseOutline from '$lib/components/CourseOutline.svelte';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import { api } from '$lib/api';
  import {
    buildScormAssetUrl,
    prepareScormCmiForResume,
    scormLaunchConfigFromLesson,
    scormLaunchKey,
  } from '$lib/scorm-config';
  import {
    applyScormCompletionMarkers,
    scormCmiIndicatesComplete,
  } from '@youniversity2/shared';
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
  let presentationIframeSrc = $state<string | null>(null);
  let presentationViewMode = $state<PresentationViewMode | null>(null);
  let syncingPresentationProgress = $state(false);
  let pendingPresentationSync = $state<{
    lessonId: string;
    payload: {
      slideIndex: number;
      maxSlideIndex: number;
      slideCount: number;
      percentComplete: number;
      isComplete?: boolean;
    };
  } | null>(null);
  let presentationSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let mountedPresentationIds = $state<Set<string>>(new Set());
  let mountedScormIds = $state<Set<string>>(new Set());
  let scormLaunchTokens = $state<Record<string, number>>({});
  let scormSessions = $state<Record<string, ScormSessionState>>({});
  let outlineMobileOpen = $state(false);
  const scormFlushFns = new Map<string, ScormFlushFn>();

  const PRESENTATION_PROGRESS_SYNC_MS = 800;

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
      const payload = msg.payload as { userId?: string } | undefined;
      const selfId = get(user)?.id;

      if (
        msg.type === WS_EVENTS.COMPLETION_EVALUATED &&
        selfId &&
        payload?.userId === selfId
      ) {
        return;
      }

      if (
        msg.type === WS_EVENTS.PROGRESS_UPDATED &&
        selfId &&
        payload?.userId === selfId
      ) {
        if ((payload as { reset?: boolean }).reset) {
          scormSessions = {};
          mountedScormIds = new Set();
          scormLaunchTokens = {};
          void refreshCourse();
        }
        return;
      }

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

  function loadPresentationView(lesson: Record<string, unknown> | null) {
    presentationIframeSrc = null;
    presentationViewMode = null;

    if (!lesson || activityType(lesson) !== 'presentation') return;

    const config = (lesson.config as Record<string, unknown>) ?? {};
    const spec = buildPresentationView(config);
    if (!spec.mode) return;

    presentationViewMode = spec.mode;

    if (spec.mode === 'embed') {
      presentationIframeSrc = spec.iframeSrc ?? null;
    }
  }

  $effect(() => {
    loadPresentationView(activeLesson);
  });

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

  function isLessonComplete(lessonId: string) {
    return isProgressFullyComplete(getLessonProgress(lessonId));
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
    else if (first?.kind === 'lesson') {
      if (activityType(first.lesson) === 'presentation') {
        markPresentationMounted(first.lesson.id as string);
      }
      if (activityType(first.lesson) === 'scorm') {
        markScormMounted(first.lesson.id as string);
        void ensureScormSession(first.lesson);
      }
      activeLesson = first.lesson;
    }
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

  function presentationActivities() {
    return sortedModules().flatMap((mod) =>
      sortedModuleActivities(mod).filter((item) => activityType(item) === 'presentation'),
    );
  }

  function markPresentationMounted(lessonId: string) {
    if (mountedPresentationIds.has(lessonId)) return;
    mountedPresentationIds = new Set([...mountedPresentationIds, lessonId]);
  }

  function markScormMounted(lessonId: string) {
    if (!mountedScormIds.has(lessonId)) {
      mountedScormIds = new Set([...mountedScormIds, lessonId]);
    }
  }

  function registerScormFlush(lessonId: string, flush: ScormFlushFn | null) {
    if (flush) scormFlushFns.set(lessonId, flush);
    else scormFlushFns.delete(lessonId);
  }

  function reloadScormPlayer(lessonId: string) {
    scormLaunchTokens = {
      ...scormLaunchTokens,
      [lessonId]: (scormLaunchTokens[lessonId] ?? 0) + 1,
    };
  }

  function scormActivities() {
    return sortedModules().flatMap((mod) =>
      sortedModuleActivities(mod).filter((item) => activityType(item) === 'scorm'),
    );
  }

  function scormLaunchConfig(lesson: Record<string, unknown>) {
    return scormLaunchConfigFromLesson(lesson, courseId);
  }

  async function ensureScormSession(lesson: Record<string, unknown>) {
    const cfg = scormLaunchConfig(lesson);
    if (!cfg) return;

    const lessonId = cfg.lessonId;
    const launchKey = scormLaunchKey(cfg);
    const existing = scormSessions[lessonId];
    if (existing?.launching && existing.launchKey === launchKey) return;

    const hadSession = Boolean(existing?.attemptId && existing.launchKey === launchKey);
    if (!hadSession) {
      scormSessions = {
        ...scormSessions,
        [lessonId]: {
          attemptId: '',
          cmi: {},
          iframeSrc: '',
          launchKey,
          launching: true,
          error: '',
        },
      };
    }

    try {
      const launch = await api.scormLaunch({
        lessonId: cfg.lessonId,
        packageId: cfg.packageId,
        scoId: cfg.scoId,
        version: cfg.version,
      });

      const sessionCmi = prepareScormCmiForResume(cfg.version, launch.cmi ?? {});

      if (scormCmiIndicatesComplete(cfg.version, sessionCmi)) {
        const completeCmi = { ...sessionCmi };
        applyScormCompletionMarkers(cfg.version, completeCmi);
        try {
          const commit = await api.scormCommit({
            attemptId: launch.attemptId,
            cmi: completeCmi,
            terminated: true,
          });
          await handleScormCommitted(lessonId, {
            isComplete: commit.derived?.isComplete,
            percentComplete: commit.derived?.percentComplete,
          });
          scormSessions = {
            ...scormSessions,
            [lessonId]: {
              attemptId: launch.attemptId,
              cmi: completeCmi,
              iframeSrc:
                existing?.iframeSrc ||
                buildScormAssetUrl(cfg.courseId, cfg.packageId, cfg.launchPath),
              launchKey,
              launching: false,
              error: '',
            },
          };
          return;
        } catch {
          // fall through with launch session
        }
      }

      scormSessions = {
        ...scormSessions,
        [lessonId]: {
          attemptId: launch.attemptId,
          cmi: sessionCmi,
          iframeSrc:
            existing?.iframeSrc ||
            buildScormAssetUrl(cfg.courseId, cfg.packageId, cfg.launchPath),
          launchKey,
          launching: false,
          error: '',
        },
      };
    } catch (e) {
      scormSessions = {
        ...scormSessions,
        [lessonId]: {
          attemptId: '',
          cmi: {},
          iframeSrc: '',
          launchKey,
          launching: false,
          error: (e as Error).message,
        },
      };
    }
  }

  function updateScormSessionCmi(lessonId: string, cmi: Record<string, unknown>) {
    const current = scormSessions[lessonId];
    if (!current) return;
    scormSessions = {
      ...scormSessions,
      [lessonId]: { ...current, cmi },
    };
  }

  async function handleScormCommitted(
    lessonId: string,
    result: { isComplete?: boolean; percentComplete?: number },
  ) {
    if (!result.isComplete) return;
    patchLessonProgress(lessonId, {
      percentComplete: result.percentComplete ?? 100,
      isComplete: true,
    });
    await invalidate('student:course');
  }

  function lessonById(lessonId: string): Record<string, unknown> | null {
    for (const mod of sortedModules()) {
      const match = sortedModuleActivities(mod).find((item) => item.id === lessonId);
      if (match) return match;
    }
    return null;
  }

  async function openLesson(lesson: Record<string, unknown>) {
    const lessonId = lesson.id as string;
    if (activeLesson?.id === lessonId) return;

    const leavingScormId =
      activeLesson && activityType(activeLesson) === 'scorm'
        ? (activeLesson.id as string)
        : null;
    if (leavingScormId) {
      await scormFlushFns.get(leavingScormId)?.(false);
    }

    const nextLesson = lessonById(lessonId) ?? lesson;

    if (activityType(nextLesson) === 'scorm') {
      const isReturn = mountedScormIds.has(lessonId);
      markScormMounted(lessonId);
      await ensureScormSession(nextLesson);
      if (isReturn) {
        reloadScormPlayer(lessonId);
      }
    }

    activeLesson = nextLesson;
    activeModuleId = null;
    if (activityType(activeLesson) === 'presentation') {
      markPresentationMounted(lessonId);
    }
    loadPresentationView(lesson);
    void flushPresentationProgressSync();
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

  function patchLessonProgress(
    lessonId: string,
    patch: Record<string, unknown>,
    progressState?: Record<string, unknown>,
  ) {
    const existing = progress.find((p) => p.lessonId === lessonId);
    if (existing) {
      progress = progress.map((p) =>
        p.lessonId === lessonId
          ? {
              ...p,
              ...patch,
              progressState: progressState
                ? { ...((p.progressState as Record<string, unknown> | undefined) ?? {}), ...progressState }
                : p.progressState,
            }
          : p,
      );
      return;
    }

    progress = [
      ...progress,
      {
        lessonId,
        percentComplete: 0,
        isComplete: false,
        ...patch,
        progressState: progressState ?? {},
      },
    ];
  }

  async function syncPresentationProgressNow(
    lessonId: string,
    payload: {
      slideIndex: number;
      maxSlideIndex: number;
      slideCount: number;
      percentComplete: number;
      isComplete?: boolean;
    },
  ) {
    if (syncingPresentationProgress) return;
    syncingPresentationProgress = true;
    try {
      await serverMutate('apiMutation', '/api/progress', 'POST', {
        lessonId,
        percentComplete: payload.percentComplete,
        ...(payload.isComplete !== undefined ? { isComplete: payload.isComplete } : {}),
        state: {
          slideIndex: payload.slideIndex,
          maxSlideIndex: payload.maxSlideIndex,
          slideCount: payload.slideCount,
        },
      });
      patchLessonProgress(
        lessonId,
        {
          percentComplete: payload.percentComplete,
          ...(payload.isComplete !== undefined ? { isComplete: payload.isComplete } : {}),
        },
        {
          slideIndex: payload.slideIndex,
          maxSlideIndex: payload.maxSlideIndex,
          slideCount: payload.slideCount,
        },
      );
    } finally {
      syncingPresentationProgress = false;
    }
  }

  function queuePresentationProgressSync(
    lessonId: string,
    payload: {
      slideIndex: number;
      maxSlideIndex: number;
      slideCount: number;
      percentComplete: number;
      isComplete?: boolean;
    },
  ) {
    pendingPresentationSync = { lessonId, payload };
    if (presentationSyncTimer) return;

    presentationSyncTimer = setTimeout(() => {
      presentationSyncTimer = null;
      const job = pendingPresentationSync;
      pendingPresentationSync = null;
      if (!job) return;

      void syncPresentationProgressNow(job.lessonId, job.payload).finally(() => {
        if (pendingPresentationSync) {
          queuePresentationProgressSync(
            pendingPresentationSync.lessonId,
            pendingPresentationSync.payload,
          );
        }
      });
    }, PRESENTATION_PROGRESS_SYNC_MS);
  }

  async function flushPresentationProgressSync() {
    if (presentationSyncTimer) {
      clearTimeout(presentationSyncTimer);
      presentationSyncTimer = null;
    }
    const job = pendingPresentationSync;
    pendingPresentationSync = null;
    if (!job) return;
    await syncPresentationProgressNow(job.lessonId, job.payload);
  }

  async function syncPresentationProgress(
    lessonId: string,
    payload: {
      slideIndex: number;
      maxSlideIndex: number;
      slideCount: number;
      percentComplete: number;
      isComplete?: boolean;
    },
  ) {
    queuePresentationProgressSync(lessonId, payload);
  }

  async function handlePresentationAllSlidesViewed(
    lessonId: string,
    payload: { slideIndex: number; maxSlideIndex: number; slideCount: number },
  ) {
    await flushPresentationProgressSync();
    await serverMutate('apiMutation', '/api/progress', 'POST', {
      lessonId,
      isComplete: true,
      percentComplete: 100,
      state: {
        slideIndex: payload.slideIndex,
        maxSlideIndex: payload.maxSlideIndex,
        slideCount: payload.slideCount,
        completedBy: 'view_all_slides',
      },
    });
    patchLessonProgress(
      lessonId,
      { isComplete: true, percentComplete: 100 },
      {
        slideIndex: payload.slideIndex,
        maxSlideIndex: payload.maxSlideIndex,
        slideCount: payload.slideCount,
        completedBy: 'view_all_slides',
      },
    );
    trackActivity('lesson.completed', courseId, lessonId);
  }

  function shouldShowManualPresentationComplete(config: Record<string, unknown>, prog?: Record<string, unknown>) {
    if (presentationCompletionMode(config) !== 'manual_confirm') return false;
    return !prog?.isComplete;
  }

  function isPresentationComplete(prog?: Record<string, unknown>) {
    return Boolean(prog?.isComplete);
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
  <PageSkeleton variant="course" ariaLabel={t('a11y.loading', $locale)} />
{:else if !course}
  <div class="empty-state">{t('course.notFound', $locale)}</div>
{:else}
  <div class="course-layout">
    <CourseOutline
      {course}
      {progress}
      {activeLesson}
      {activeModuleId}
      showStaffNav={$showStaffNav}
      bind:mobileOpen={outlineMobileOpen}
      onOpenLesson={(lesson) => void openLesson(lesson)}
      onOpenModule={(mod) => void openModule(mod)}
      onTranslate={translateCourse}
    />

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
        {#key activeLesson.id}
        {@const type = activityType(activeLesson)}
        {@const config = (activeLesson.config as Record<string, unknown>) ?? {}}

        <h2>{activeLesson.title as string}</h2>

        {#if type !== 'certificate' && activeLesson.content}
          <div class="lesson-text-content activity-description">{activeLesson.content as string}</div>
        {/if}
        {/key}

        {#if mountedPresentationIds.size > 0}
          <div class="presentation-viewers">
            {#each presentationActivities() as presLesson (presLesson.id)}
              {@const presConfig = (presLesson.config as Record<string, unknown>) ?? {}}
              {@const presSpec = buildPresentationView(presConfig)}
              {@const presProgress = getLessonProgress(presLesson.id as string)}
              {@const savedPresentationProgress = presentationProgressFromRecord(presProgress)}
              {@const isActivePresentation = activeLesson.id === presLesson.id}
              {#if mountedPresentationIds.has(presLesson.id as string) && (presSpec.mode === 'pptx' || presSpec.mode === 'pdf') && presSpec.relativeUrl}
                {#if presSpec.mode === 'pptx'}
                  <PresentationPptxViewer
                    active={isActivePresentation}
                    url={presSpec.relativeUrl}
                    locale={$locale}
                    completionMode={presentationCompletionMode(presConfig)}
                    slideMinSeconds={presentationSlideMinSeconds(presConfig)}
                    slideMinOverrides={presentationSlideMinOverrides(presConfig)}
                    initialProgress={savedPresentationProgress}
                    alreadyComplete={isPresentationComplete(presProgress)}
                    onProgressChange={(payload) => {
                      if (isPresentationComplete(getLessonProgress(presLesson.id as string))) return;
                      void syncPresentationProgress(presLesson.id as string, payload);
                    }}
                    onAllSlidesViewed={async (payload) => {
                      if (isPresentationComplete(getLessonProgress(presLesson.id as string))) return;
                      await handlePresentationAllSlidesViewed(presLesson.id as string, payload);
                    }}
                  />
                {:else}
                  <PresentationPdfViewer
                    active={isActivePresentation}
                    url={presSpec.relativeUrl}
                    locale={$locale}
                    completionMode={presentationCompletionMode(presConfig)}
                    slideMinSeconds={presentationSlideMinSeconds(presConfig)}
                    slideMinOverrides={presentationSlideMinOverrides(presConfig)}
                    initialProgress={savedPresentationProgress}
                    alreadyComplete={isPresentationComplete(presProgress)}
                    onProgressChange={(payload) => {
                      if (isPresentationComplete(getLessonProgress(presLesson.id as string))) return;
                      void syncPresentationProgress(presLesson.id as string, payload);
                    }}
                    onAllSlidesViewed={async (payload) => {
                      if (isPresentationComplete(getLessonProgress(presLesson.id as string))) return;
                      await handlePresentationAllSlidesViewed(presLesson.id as string, payload);
                    }}
                  />
                {/if}
              {/if}
            {/each}
          </div>
        {/if}

        {#if mountedScormIds.size > 0}
          <div class="scorm-viewers">
            {#each scormActivities() as scormLesson (scormLesson.id)}
              {@const scormConfig = scormLaunchConfig(scormLesson)}
              {#if mountedScormIds.has(scormLesson.id as string) && scormConfig}
                {#key `${scormLesson.id}:${scormLaunchTokens[scormLesson.id as string] ?? 0}`}
                  <ScormPlayer
                    active={activeLesson?.id === scormLesson.id}
                    session={scormSessions[scormLesson.id as string] ?? null}
                    locale={$locale}
                    config={scormConfig}
                    registerFlush={registerScormFlush}
                    onCmiSaved={(cmi) => updateScormSessionCmi(scormLesson.id as string, cmi)}
                    onCommitted={(result) => void handleScormCommitted(scormLesson.id as string, result)}
                  />
                {/key}
              {/if}
            {/each}
          </div>
        {/if}

        {#key activeLesson.id}
        {@const type = activityType(activeLesson)}
        {@const config = (activeLesson.config as Record<string, unknown>) ?? {}}

        {#if type === 'scorm'}
          {@const scormConfig = scormLaunchConfig(activeLesson)}
          {#if !scormConfig}
            <p class="empty-hint">SCORM aktivita nemá nastavený balík alebo SCO.</p>
          {/if}
        {:else if type === 'video'}
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
          {@const config = (activeLesson.config as Record<string, unknown>) ?? {}}
          {@const presentationSpec = buildPresentationView(config)}
          {@const lessonProgress = getLessonProgress(activeLesson.id as string)}
          {#if presentationSpec.mode === 'embed' && presentationSpec.iframeSrc}
            <div class="presentation-wrap">
              <iframe
                src={presentationSpec.iframeSrc}
                title={activeLesson.title as string}
                allow="fullscreen"
                allowfullscreen
              ></iframe>
            </div>
          {/if}
          {#if presentationSpec.downloadUrl && presentationSpec.mode !== 'download'}
            <p class="presentation-pdf-link">
              <a href={presentationSpec.downloadUrl} download={(config.fileName as string) || undefined}>
                {t('course.presentationDownload', $locale)}
              </a>
            </p>
          {/if}
          {#if presentationSpec.mode === 'download' && presentationSpec.downloadUrl}
            <div class="presentation-download-panel">
              <a
                class="btn btn-sm"
                href={presentationSpec.downloadUrl}
                download={(config.fileName as string) || undefined}
              >
                {t('course.presentationDownload', $locale)}
              </a>
            </div>
            {#if isLegacyPptPresentation(config.fileName as string | undefined, config.fileContentType as string | undefined)}
              <p class="video-rule-note">{t('course.presentationLegacyPptHint', $locale)}</p>
            {:else if isOdpPresentation(config.fileName as string | undefined, config.fileContentType as string | undefined)}
              <p class="video-rule-note">{t('course.presentationOdpHint', $locale)}</p>
            {/if}
          {:else if !presentationSpec.mode}
            <p class="empty-hint">{t('course.presentationEmpty', $locale)}</p>
          {/if}
          {#if isPresentationComplete(lessonProgress)}
            <p class="video-rule-note">{t('course.presentationCompleted', $locale)}</p>
          {:else if shouldShowManualPresentationComplete(config, lessonProgress)}
            <button onclick={() => markComplete(activeLesson!.id as string)}>
              {t('course.presentationMarkRead', $locale)}
            </button>
          {:else if presentationCompletionMode(config) === 'view_all_slides' && presentationSpec.mode === 'embed'}
            <p class="video-rule-note">{t('course.presentationViewAllEmbedOnly', $locale)}</p>
            <button onclick={() => markComplete(activeLesson!.id as string)}>
              {t('course.presentationMarkRead', $locale)}
            </button>
          {/if}
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
        {/key}
      {:else}
        <p class="empty-hint">Vyberte aktivitu zo zoznamu vľavo.</p>
      {/if}
    </section>
  </div>
{/if}

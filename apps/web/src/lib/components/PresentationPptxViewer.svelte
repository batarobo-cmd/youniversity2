<script lang="ts">

  import { onDestroy } from 'svelte';
  import { tick } from 'svelte';

  import { get } from 'svelte/store';

  import { token } from '$lib/stores/auth';

  import { t } from '$lib/i18n';

  import type { Locale } from '@youniversity2/shared';

  import type { PresentationCompletionMode, PresentationProgressState, SlideMinOverrides } from '$lib/presentation-config';

  import { effectiveSlideMinSeconds } from '$lib/presentation-config';

  const DEFAULT_SLIDE_ASPECT = 9 / 16;



  type PptxPreviewer = {

    destroy: () => void;

    preview: (file: ArrayBuffer) => Promise<unknown>;

    load: (file: ArrayBuffer) => Promise<{ width: number; height: number }>;

    currentIndex: number;

    slideCount: number;

    renderNextSlide: () => void;

    renderPreSlide: () => void;

    renderSingleSlide: (slideIndex: number) => void;

  };



  const REFERENCE_RENDER_WIDTH = 960;



  let {

    url,

    locale,

    active = true,

    completionMode = 'manual_confirm',

    slideMinSeconds = 0,

    slideMinOverrides = {},

    initialProgress = {},

    alreadyComplete = false,

    onProgressChange,

    onAllSlidesViewed,

  }: {

    url: string;

    locale: Locale;

    active?: boolean;

    completionMode?: PresentationCompletionMode;

    slideMinSeconds?: number;

    slideMinOverrides?: SlideMinOverrides;

    initialProgress?: PresentationProgressState;

    alreadyComplete?: boolean;

    onProgressChange?: (payload: {

      slideIndex: number;

      maxSlideIndex: number;

      slideCount: number;

      percentComplete: number;

    }) => void;

    onAllSlidesViewed?: (payload: {

      slideIndex: number;

      maxSlideIndex: number;

      slideCount: number;

    }) => void | Promise<void>;

  } = $props();



  let stage = $state<HTMLDivElement | null>(null);

  let container = $state<HTMLDivElement | null>(null);

  let loading = $state(true);

  let error = $state('');

  let previewer = $state<PptxPreviewer | null>(null);

  let renderGeneration = 0;

  let slideIndex = $state(0);

  let slideCount = $state(0);

  let maxSlideIndex = $state(0);

  let slideEnteredAt = $state(Date.now());

  let nowTick = $state(Date.now());

  let unlockedSlides = $state<Set<number>>(new Set());

  let completionTriggered = $state(false);

  let renderWidth = $state(REFERENCE_RENDER_WIDTH);

  let renderHeight = $state(Math.round(REFERENCE_RENDER_WIDTH * (9 / 16)));



  function minWaitMsForSlide(index: number) {

    return Math.max(0, effectiveSlideMinSeconds(slideMinSeconds, slideMinOverrides, index)) * 1000;

  }



  function isSlideTimerUnlocked(index: number) {

    if (minWaitMsForSlide(index) <= 0) return true;

    if (index < maxSlideIndex) return true;

    return unlockedSlides.has(index);

  }



  function hasReachedLastSlide() {

    return slideCount > 0 && maxSlideIndex >= slideCount - 1 && slideIndex === slideCount - 1;

  }



  function markSlideUnlocked(index: number) {

    if (isSlideTimerUnlocked(index)) return;

    unlockedSlides = new Set([...unlockedSlides, index]);

  }



  function tryCompletePresentation() {

    if (alreadyComplete || completionTriggered || completionMode !== 'view_all_slides') return;

    if (!previewer || !hasReachedLastSlide()) return;

    if (!isSlideTimerUnlocked(slideIndex)) return;

    if (!onAllSlidesViewed) return;



    completionTriggered = true;

    void Promise.resolve(

      onAllSlidesViewed({

        slideIndex,

        maxSlideIndex: Math.max(maxSlideIndex, slideIndex),

        slideCount,

      }),

    ).catch(() => {

      completionTriggered = false;

    });

  }



  const currentSlideMinSeconds = $derived(

    effectiveSlideMinSeconds(slideMinSeconds, slideMinOverrides, slideIndex),

  );

  const minWaitMs = $derived(Math.max(0, currentSlideMinSeconds) * 1000);

  const slideTimerActive = $derived(minWaitMs > 0 && !isSlideTimerUnlocked(slideIndex));

  const waitRemainingMs = $derived(

    slideTimerActive ? Math.max(0, minWaitMs - (nowTick - slideEnteredAt)) : 0,

  );

  const canGoNext = $derived(

    !previewer ||

      slideIndex >= slideCount - 1 ||

      !slideTimerActive ||

      nowTick - slideEnteredAt >= minWaitMs,

  );

  const canGoPrev = $derived(Boolean(previewer && slideIndex > 0));



  let tickTimer: ReturnType<typeof setInterval> | null = null;

  let resizeObserver: ResizeObserver | null = null;



  function hideLibraryChrome(root: HTMLElement) {

    for (const el of root.querySelectorAll(

      '.pptx-preview-wrapper-pagination, .pptx-preview-wrapper-next, .pptx-preview-wrapper-prev',

    )) {

      (el as HTMLElement).style.display = 'none';

    }

  }



  function fitRenderedSlide() {

    const stageEl = stage;

    const containerEl = container;

    if (!stageEl || !containerEl || renderWidth <= 0 || renderHeight <= 0) return;



    const availableWidth = Math.max(Math.round(stageEl.getBoundingClientRect().width), 1);

    const fitScale = Math.min(1, availableWidth / renderWidth);

    const scaledWidth = renderWidth * fitScale;

    const scaledHeight = renderHeight * fitScale;

    const offsetX = Math.max(0, (availableWidth - scaledWidth) / 2);



    stageEl.style.height = `${Math.ceil(scaledHeight)}px`;

    containerEl.style.width = `${renderWidth}px`;

    containerEl.style.height = `${renderHeight}px`;

    containerEl.style.transformOrigin = 'top left';

    if (fitScale < 1) {

      containerEl.style.transform = `translateX(${offsetX}px) scale(${fitScale})`;

    } else if (offsetX > 0) {

      containerEl.style.transform = `translateX(${offsetX}px)`;

    } else {

      containerEl.style.transform = '';

    }

  }



  function emitProgress() {

    if (!previewer || slideCount <= 0) return;

    onProgressChange?.({

      slideIndex,

      maxSlideIndex,

      slideCount,

      percentComplete: Math.min(100, Math.round(((maxSlideIndex + 1) / slideCount) * 100)),

    });

  }



  function syncFromPreviewer() {

    if (!previewer) return;

    slideIndex = previewer.currentIndex;

    slideCount = previewer.slideCount;

    maxSlideIndex = Math.max(maxSlideIndex, slideIndex);

    slideEnteredAt = Date.now();

    emitProgress();

    tryCompletePresentation();

  }



  function goNext() {

    if (!previewer || !canGoNext || slideIndex >= slideCount - 1) return;

    markSlideUnlocked(slideIndex);

    previewer.renderNextSlide();

    syncFromPreviewer();

  }



  function goPrev() {

    if (!previewer || !canGoPrev) return;

    previewer.renderPreSlide();

    syncFromPreviewer();

  }



  $effect(() => {

    const stageEl = stage;

    if (!stageEl) return;



    resizeObserver?.disconnect();

    resizeObserver = new ResizeObserver(() => fitRenderedSlide());

    resizeObserver.observe(stageEl);



    return () => {

      resizeObserver?.disconnect();

      resizeObserver = null;

    };

  });



  $effect(() => {
    if (!active || loading || !previewer) return;
    void tick().then(() => {
      requestAnimationFrame(() => fitRenderedSlide());
    });
  });

  $effect(() => {
    const target = container;
    const sourceUrl = url;
    if (!sourceUrl) return;
    if (!target) {
      loading = true;
      return;
    }

    const generation = ++renderGeneration;
    let cancelled = false;
    let localPreviewer: PptxPreviewer | null = null;

    async function render() {
      loading = true;
      error = '';
      previewer = null;
      completionTriggered = alreadyComplete;
      unlockedSlides = new Set();
      target.replaceChildren();

      try {
        const authToken = get(token);
        const res = await fetch(sourceUrl, {
          credentials: 'include',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer = await res.arrayBuffer();
        if (cancelled || generation !== renderGeneration) return;

        await tick();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled || generation !== renderGeneration) return;

        const width = REFERENCE_RENDER_WIDTH;
        const height = Math.round(width * DEFAULT_SLIDE_ASPECT);
        renderWidth = width;
        renderHeight = height;

        const { init } = await import('pptx-preview');
        if (cancelled || generation !== renderGeneration) return;

        localPreviewer = init(target, {
          width,
          height,
          mode: 'slide',
        }) as PptxPreviewer;
        if (cancelled || generation !== renderGeneration) {
          localPreviewer.destroy();
          return;
        }

        await localPreviewer.preview(buffer);
        if (cancelled || generation !== renderGeneration) return;

        hideLibraryChrome(target);
        previewer = localPreviewer;
        slideCount = localPreviewer.slideCount;
        const savedIndex = Math.min(
          Math.max(0, initialProgress.slideIndex ?? initialProgress.maxSlideIndex ?? 0),
          Math.max(0, slideCount - 1),
        );
        maxSlideIndex = Math.min(
          Math.max(savedIndex, initialProgress.maxSlideIndex ?? savedIndex),
          Math.max(0, slideCount - 1),
        );
        if (savedIndex > 0) {
          localPreviewer.renderSingleSlide(savedIndex);
        }
        slideIndex = localPreviewer.currentIndex;
        slideEnteredAt = Date.now();
        fitRenderedSlide();
        if (!alreadyComplete) {
          emitProgress();
        }
      } catch (e) {
        if (!cancelled && generation === renderGeneration) {
          error = (e as Error).message || 'render failed';
        }
      } finally {
        if (!cancelled && generation === renderGeneration) loading = false;
        if (!cancelled && generation === renderGeneration && !alreadyComplete) {
          tryCompletePresentation();
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
      localPreviewer?.destroy();
      previewer = null;
      target.replaceChildren();
    };
  });



  $effect(() => {

    if (!slideTimerActive || loading) {

      if (tickTimer) {

        clearInterval(tickTimer);

        tickTimer = null;

      }

      return;

    }

    tickTimer = setInterval(() => {

      nowTick = Date.now();

    }, 250);

    return () => {

      if (tickTimer) clearInterval(tickTimer);

      tickTimer = null;

    };

  });



  $effect(() => {

    const index = slideIndex;

    const wait = minWaitMs;

    if (loading || alreadyComplete || wait <= 0 || isSlideTimerUnlocked(index)) return;

    if (nowTick - slideEnteredAt >= wait) {

      markSlideUnlocked(index);

      tryCompletePresentation();

    }

  });



  onDestroy(() => {

    previewer?.destroy();

    resizeObserver?.disconnect();

  });

</script>



<div class="pptx-viewer-host" class:pptx-viewer-host--inactive={!active}>

  {#if loading}

    <p class="empty-hint pptx-viewer-status">{t('course.presentationLoading', locale)}</p>

  {/if}

  {#if error}

    <p class="video-rule-warning pptx-viewer-status">

      {t('course.presentationRenderError', locale)}

    </p>

  {/if}

  <div class="pptx-viewer-stage" bind:this={stage}>

    <div class="pptx-viewer" bind:this={container} aria-busy={loading}></div>

  </div>



  {#if previewer && slideCount > 0}

    <div class="pptx-viewer-controls">

      <button type="button" class="pptx-nav-btn" disabled={!canGoPrev} onclick={goPrev} aria-label={t('course.presentationPrevSlide', locale)}>

        ‹

      </button>

      <span class="pptx-slide-counter">{slideIndex + 1}/{slideCount}</span>

      <button type="button" class="pptx-nav-btn" disabled={!canGoNext} onclick={goNext} aria-label={t('course.presentationNextSlide', locale)}>

        ›

      </button>

    </div>

    {#if slideTimerActive && waitRemainingMs > 0}

      <p class="video-rule-note">

        {t('course.presentationSlideWait', locale).replace('{seconds}', String(Math.ceil(waitRemainingMs / 1000)))}

      </p>

    {/if}

    {#if completionMode === 'view_all_slides'}

      <p class="video-rule-note">{t('course.presentationViewAllHint', locale)}</p>

    {/if}

  {/if}

</div>



<style>

  .pptx-viewer-host {

    margin-bottom: 1.25rem;

  }

  .pptx-viewer-host--inactive {
    display: none;
  }



  .pptx-viewer-status {

    margin: 0 0 0.75rem;

  }



  .pptx-viewer-stage {

    width: 100%;

    overflow: hidden;

    border-radius: var(--radius-lg);

    background: #fff;

    border: 1px solid var(--color-border);

  }



  .pptx-viewer {

    overflow: hidden;

    background: #fff;

  }



  .pptx-viewer :global(.pptx-preview-wrapper) {

    display: block !important;

    margin: 0 auto !important;

    background: #fff !important;

    overflow: hidden !important;

  }



  .pptx-viewer :global(.pptx-preview-slide-wrapper) {

    overflow: hidden !important;

    margin: 0 auto !important;

  }



  .pptx-viewer :global(.pptx-preview-wrapper-pagination),

  .pptx-viewer :global(.pptx-preview-wrapper-next),

  .pptx-viewer :global(.pptx-preview-wrapper-prev) {

    display: none !important;

  }



  .pptx-viewer-controls {

    display: flex;

    align-items: center;

    justify-content: flex-end;

    gap: 0.5rem;

    margin-top: 0.75rem;

  }



  .pptx-nav-btn {

    width: 2.25rem;

    height: 2.25rem;

    border-radius: 999px;

    border: 1px solid var(--color-border);

    background: var(--color-bg-elevated);

    color: var(--color-text);

    font-size: 1.25rem;

    line-height: 1;

    cursor: pointer;

  }



  .pptx-nav-btn:disabled {

    opacity: 0.45;

    cursor: not-allowed;

  }



  .pptx-slide-counter {

    min-width: 3.5rem;

    text-align: center;

    font-size: 0.875rem;

    color: var(--color-text-secondary);

  }

</style>



<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { token } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import type { PresentationCompletionMode, PresentationProgressState, SlideMinOverrides } from '$lib/presentation-config';
  import { effectiveSlideMinSeconds } from '$lib/presentation-config';
  import { loadPdfJs } from '$lib/presentation-pdf-client';
  import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
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
  let canvas = $state<HTMLCanvasElement | null>(null);
  let loading = $state(true);
  let error = $state('');
  let pdfDoc = $state<PDFDocumentProxy | null>(null);
  let slideIndex = $state(0);
  let slideCount = $state(0);
  let maxSlideIndex = $state(0);
  let slideEnteredAt = $state(Date.now());
  let nowTick = $state(Date.now());
  let unlockedSlides = $state<Set<number>>(new Set());
  let completionTriggered = $state(false);
  let renderWidth = $state(REFERENCE_RENDER_WIDTH);
  let renderHeight = $state(Math.round(REFERENCE_RENDER_WIDTH * (9 / 16)));
  let renderTaskId = 0;

  function minWaitMsForSlide(index: number) {
    return Math.max(0, effectiveSlideMinSeconds(slideMinSeconds, slideMinOverrides, index)) * 1000;
  }

  function isSlideTimerUnlocked(index: number) {
    if (minWaitMsForSlide(index) <= 0) return true;
    if (index < maxSlideIndex) return true;
    return unlockedSlides.has(index);
  }

  function hasReachedLastSlide() {
    return slideCount > 0 && slideIndex >= slideCount - 1;
  }

  function markSlideUnlocked(index: number) {
    if (isSlideTimerUnlocked(index)) return;
    unlockedSlides = new Set([...unlockedSlides, index]);
  }

  function ensureLastSlideUnlocked() {
    if (slideCount <= 0 || slideIndex < slideCount - 1) return;
    if (minWaitMsForSlide(slideIndex) <= 0) {
      markSlideUnlocked(slideIndex);
    }
  }

  function tryCompletePresentation() {
    if (!active || alreadyComplete || completionTriggered || completionMode !== 'view_all_slides') return;
    if (!pdfDoc || !hasReachedLastSlide()) return;
    if (!isSlideTimerUnlocked(slideIndex)) return;
    if (!onAllSlidesViewed) return;

    completionTriggered = true;
    void (async () => {
      try {
        await onAllSlidesViewed({
          slideIndex,
          maxSlideIndex: Math.max(maxSlideIndex, slideIndex, slideCount - 1),
          slideCount,
        });
      } catch {
        completionTriggered = false;
      }
    })();
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
    !pdfDoc ||
      slideIndex >= slideCount - 1 ||
      !slideTimerActive ||
      nowTick - slideEnteredAt >= minWaitMs,
  );
  const canGoPrev = $derived(Boolean(pdfDoc && slideIndex > 0));

  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function fitRenderedSlide() {
    const stageEl = stage;
    const canvasEl = canvas;
    if (!stageEl || !canvasEl || renderWidth <= 0 || renderHeight <= 0) return;

    const availableWidth = Math.max(Math.round(stageEl.getBoundingClientRect().width), 1);
    const fitScale = Math.min(1, availableWidth / renderWidth);
    const scaledHeight = renderHeight * fitScale;
    const scaledWidth = renderWidth * fitScale;
    const offsetX = Math.max(0, (availableWidth - scaledWidth) / 2);

    stageEl.style.height = `${Math.ceil(scaledHeight)}px`;
    canvasEl.style.width = `${renderWidth}px`;
    canvasEl.style.height = `${renderHeight}px`;
    canvasEl.style.transformOrigin = 'top left';

    if (fitScale < 1) {
      canvasEl.style.transform = `translateX(${offsetX}px) scale(${fitScale})`;
    } else if (offsetX > 0) {
      canvasEl.style.transform = `translateX(${offsetX}px)`;
    } else {
      canvasEl.style.transform = '';
    }
  }

  function emitProgress() {
    if (!pdfDoc || slideCount <= 0) return;
    onProgressChange?.({
      slideIndex,
      maxSlideIndex,
      slideCount,
      percentComplete: Math.min(100, Math.round(((maxSlideIndex + 1) / slideCount) * 100)),
    });
  }

  async function renderCurrentPage() {
    const doc = pdfDoc;
    const canvasEl = canvas;
    if (!doc || !canvasEl || slideCount <= 0) return;

    const taskId = ++renderTaskId;
    const pageNumber = slideIndex + 1;

    try {
      const page = await doc.getPage(pageNumber);
      if (taskId !== renderTaskId) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = REFERENCE_RENDER_WIDTH / baseViewport.width;
      const viewport = page.getViewport({ scale });
      renderWidth = Math.ceil(viewport.width);
      renderHeight = Math.ceil(viewport.height);

      canvasEl.width = renderWidth;
      canvasEl.height = renderHeight;

      const context = canvasEl.getContext('2d');
      if (!context) return;

      await page.render({ canvasContext: context, viewport, canvas: canvasEl }).promise;
      if (taskId !== renderTaskId) return;

      fitRenderedSlide();
      tryCompletePresentation();
    } catch (e) {
      if (taskId === renderTaskId) {
        error = (e as Error).message || 'render failed';
      }
    }
  }

  function goNext() {
    if (!pdfDoc || !canGoNext || slideIndex >= slideCount - 1) return;
    markSlideUnlocked(slideIndex);
    slideIndex += 1;
    maxSlideIndex = Math.max(maxSlideIndex, slideIndex);
    slideEnteredAt = Date.now();
    ensureLastSlideUnlocked();
    emitProgress();
    tryCompletePresentation();
  }

  function goPrev() {
    if (!pdfDoc || slideIndex <= 0) return;
    slideIndex -= 1;
    slideEnteredAt = Date.now();
    emitProgress();
  }

  $effect(() => {
    const stageEl = stage;
    if (!browser || !stageEl) return;

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => fitRenderedSlide());
    resizeObserver.observe(stageEl);

    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
  });

  $effect(() => {
    const sourceUrl = url;
    if (!browser || !sourceUrl || !active) return;

    let cancelled = false;
    let loadedDoc: PDFDocumentProxy | null = null;

    async function loadPdf() {
      loading = true;
      error = '';
      pdfDoc = null;
      slideIndex = 0;
      slideCount = 0;
      maxSlideIndex = 0;
      completionTriggered = alreadyComplete;
      unlockedSlides = new Set();

      try {
        const { getDocument } = await loadPdfJs();
        if (cancelled) return;

        const authToken = get(token);
        const res = await fetch(sourceUrl, {
          credentials: 'include',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const doc = await getDocument({ data: buffer }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }

        loadedDoc = doc;
        pdfDoc = doc;
        slideCount = doc.numPages;

        const savedIndex = Math.min(
          Math.max(0, initialProgress.slideIndex ?? initialProgress.maxSlideIndex ?? 0),
          Math.max(0, slideCount - 1),
        );
        maxSlideIndex = Math.min(
          Math.max(savedIndex, initialProgress.maxSlideIndex ?? savedIndex),
          Math.max(0, slideCount - 1),
        );
        slideIndex = savedIndex;
        slideEnteredAt = Date.now();
        if (savedIndex >= slideCount - 1) {
          maxSlideIndex = Math.max(maxSlideIndex, slideCount - 1);
          ensureLastSlideUnlocked();
        }

        if (!alreadyComplete) {
          emitProgress();
        }
      } catch (e) {
        if (!cancelled) error = (e as Error).message || 'load failed';
      } finally {
        if (!cancelled) loading = false;
        if (!cancelled && !alreadyComplete) {
          ensureLastSlideUnlocked();
          tryCompletePresentation();
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void loadedDoc?.destroy();
      if (pdfDoc === loadedDoc) {
        pdfDoc = null;
      }
    };
  });

  $effect(() => {
    slideIndex;
    pdfDoc;
    canvas;
    active;
    if (!browser || !active || loading || !pdfDoc || !canvas) return;
    void renderCurrentPage();
  });

  $effect(() => {
    if (!slideTimerActive || loading || !active) {
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
    if (!active || loading || alreadyComplete || wait <= 0 || isSlideTimerUnlocked(index)) return;
    if (nowTick - slideEnteredAt >= wait) {
      markSlideUnlocked(index);
      tryCompletePresentation();
    }
  });

  $effect(() => {
    slideIndex;
    maxSlideIndex;
    slideCount;
    nowTick;
    unlockedSlides;
    loading;
    pdfDoc;
    active;
    alreadyComplete;
    if (!active || loading || alreadyComplete || completionTriggered || completionMode !== 'view_all_slides') return;
    tryCompletePresentation();
  });

  $effect(() => {
    if (alreadyComplete) completionTriggered = true;
  });

  $effect(() => {
    if (!active || loading || !pdfDoc || slideCount <= 0 || slideIndex < slideCount - 1) return;
    ensureLastSlideUnlocked();
    void tick().then(() => tryCompletePresentation());
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    void pdfDoc?.destroy();
    pdfDoc = null;
  });
</script>

<div class="pdf-viewer-host" class:pdf-viewer-host--inactive={!active}>
  {#if loading}
    <p class="empty-hint pdf-viewer-status">{t('course.presentationLoading', locale)}</p>
  {/if}
  {#if error}
    <p class="video-rule-warning pdf-viewer-status">
      {t('course.presentationRenderError', locale)}
    </p>
  {/if}
  <div class="pdf-viewer-stage" bind:this={stage}>
    <canvas class="pdf-viewer-canvas" bind:this={canvas} aria-busy={loading}></canvas>
  </div>

  {#if pdfDoc && slideCount > 0}
    <div class="pdf-viewer-controls">
      <button type="button" class="pdf-nav-btn" disabled={!canGoPrev} onclick={goPrev} aria-label={t('course.presentationPrevSlide', locale)}>
        ‹
      </button>
      <span class="pdf-slide-counter">{slideIndex + 1}/{slideCount}</span>
      <button type="button" class="pdf-nav-btn" disabled={!canGoNext} onclick={goNext} aria-label={t('course.presentationNextSlide', locale)}>
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
  .pdf-viewer-host {
    margin-bottom: 1.25rem;
  }

  .pdf-viewer-host--inactive {
    display: none;
  }

  .pdf-viewer-status {
    margin: 0 0 0.75rem;
  }

  .pdf-viewer-stage {
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: #fff;
    border: 1px solid var(--color-border);
  }

  .pdf-viewer-canvas {
    display: block;
    background: #fff;
  }

  .pdf-viewer-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .pdf-nav-btn {
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

  .pdf-nav-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .pdf-slide-counter {
    min-width: 3.5rem;
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
</style>

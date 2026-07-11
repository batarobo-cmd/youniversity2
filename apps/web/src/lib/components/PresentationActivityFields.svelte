<script lang="ts">
  import { token } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import {
    type PresentationFormState,
    validatePresentationForm,
    presentationPreviewLabel,
    encodePresentationMediaUrl,
    effectiveSlideMinSeconds,
    normalizeSlideMinOverrides,
    isPptxPresentation,
    isPdfPresentation,
  } from '$lib/presentation-config';
  import { inspectPresentationSlides } from '$lib/presentation-slide-meta';

  let {
    courseId,
    locale,
    disabled = false,
    form = $bindable(),
  }: {
    courseId: string;
    locale: Locale;
    disabled?: boolean;
    form: PresentationFormState;
  } = $props();

  let uploading = $state(false);
  let uploadError = $state('');
  let dragOver = $state(false);
  let detectingSlides = $state(false);
  let slideTimingExpanded = $state(false);
  let slideDetectTried = $state(false);

  const preview = $derived(presentationPreviewLabel(form));
  const canInspectSlides = $derived(
    form.deliveryMode === 'upload' &&
      Boolean(form.fileKey || form.presentationUrl) &&
      (isPptxPresentation(form.fileName, form.fileContentType) ||
        isPdfPresentation(form.fileName, form.fileContentType)),
  );
  const slideIndices = $derived(
    form.slideCount && form.slideCount > 0
      ? Array.from({ length: form.slideCount }, (_, index) => index)
      : [],
  );
  const visibleSlideIndices = $derived(
    slideTimingExpanded || slideIndices.length <= 12 ? slideIndices : slideIndices.slice(0, 12),
  );
  const globalSlideMin = $derived(Math.max(0, Math.round(form.slideMinSeconds ?? 0)));

  function trimOverridesForSlideCount(overrides: PresentationFormState['slideMinOverrides']) {
    if (!overrides || !form.slideCount) return overrides;
    const next = { ...overrides };
    for (const key of Object.keys(next)) {
      if (Number(key) >= form.slideCount!) delete next[Number(key)];
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }

  async function detectSlideCount(
    source: File | ArrayBuffer,
    fileName = form.fileName,
    contentType = form.fileContentType,
  ) {
    if (!isPptxPresentation(fileName, contentType) && !isPdfPresentation(fileName, contentType)) return;
    detectingSlides = true;
    try {
      const count = await inspectPresentationSlides(source, fileName, contentType);
      if (count > 0) {
        form = {
          ...form,
          slideCount: count,
          slideMinOverrides: trimOverridesForSlideCount(form.slideMinOverrides),
        };
      }
    } catch {
      // Keep editor usable even if inspection fails.
    } finally {
      detectingSlides = false;
      slideDetectTried = true;
    }
  }

  async function detectSlideCountFromUrl() {
    if (!form.presentationUrl || detectingSlides || slideDetectTried) return;
    detectingSlides = true;
    try {
      const authToken = get(token);
      const res = await fetch(form.presentationUrl, {
        credentials: 'include',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      const count = await inspectPresentationSlides(buffer, form.fileName, form.fileContentType);
      if (count > 0) {
        form = {
          ...form,
          slideCount: count,
          slideMinOverrides: trimOverridesForSlideCount(form.slideMinOverrides),
        };
      }
    } catch {
      // Ignore background detection errors.
    } finally {
      detectingSlides = false;
      slideDetectTried = true;
    }
  }

  $effect(() => {
    if (!canInspectSlides || form.slideCount || detectingSlides || slideDetectTried || uploading) return;
    void detectSlideCountFromUrl();
  });

  function setGlobalSlideMin(value: string) {
    const parsed = value.trim() === '' ? undefined : Number.parseInt(value, 10);
    const nextGlobal = parsed === undefined || Number.isNaN(parsed) ? undefined : Math.max(0, parsed);
    form = {
      ...form,
      slideMinSeconds: nextGlobal,
      slideMinOverrides: normalizeSlideMinOverrides(nextGlobal ?? 0, form.slideMinOverrides),
    };
  }

  function slideOverrideValue(index: number): string {
    const override = form.slideMinOverrides?.[index];
    return override !== undefined ? String(override) : '';
  }

  function setSlideOverride(index: number, value: string) {
    const parsed = value.trim() === '' ? undefined : Number.parseInt(value, 10);
    const nextOverrides = { ...(form.slideMinOverrides ?? {}) };

    if (parsed === undefined || Number.isNaN(parsed)) {
      delete nextOverrides[index];
    } else {
      const rounded = Math.max(0, parsed);
      if (rounded <= globalSlideMin) {
        delete nextOverrides[index];
      } else {
        nextOverrides[index] = rounded;
      }
    }

    form = {
      ...form,
      slideMinOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    };
  }

  function adjustSlideOverride(index: number, delta: number) {
    const current = effectiveSlideMinSeconds(globalSlideMin, form.slideMinOverrides, index);
    const next = Math.max(0, current + delta);
    setSlideOverride(index, next <= globalSlideMin ? '' : String(next));
  }

  function effectiveForSlide(index: number) {
    return effectiveSlideMinSeconds(globalSlideMin, form.slideMinOverrides, index);
  }

  function hasCustomOverride(index: number) {
    const override = form.slideMinOverrides?.[index];
    return override !== undefined && override > globalSlideMin;
  }

  async function uploadSelectedFile(file: File) {
    uploadError = '';
    uploading = true;
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('courseId', courseId);

      const authToken = get(token);
      const res = await fetch('/api/media/presentations', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `Chyba ${res.status}`);
      }

      const data = body as { fileKey: string; presentationUrl: string; fileName: string; contentType: string };
      form = {
        ...form,
        deliveryMode: 'upload',
        fileKey: data.fileKey,
        presentationUrl: encodePresentationMediaUrl(data.presentationUrl),
        fileName: data.fileName,
        fileContentType: data.contentType,
        slideCount: undefined,
        slideMinOverrides: undefined,
      };
      slideDetectTried = false;
      await detectSlideCount(file, data.fileName, data.contentType);
    } catch (e) {
      uploadError = (e as Error).message;
    } finally {
      uploading = false;
    }
  }

  async function onFileInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await uploadSelectedFile(file);
    input.value = '';
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (disabled || uploading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) await uploadSelectedFile(file);
  }

  function clearUpload() {
    form = {
      ...form,
      fileKey: undefined,
      presentationUrl: undefined,
      fileName: undefined,
      fileContentType: undefined,
      slideCount: undefined,
      slideMinOverrides: undefined,
    };
    slideDetectTried = false;
  }

  export function validate(): string | null {
    return validatePresentationForm(form, {
      uploadRequired: t('admin.presentationUploadRequired', locale),
      embedRequired: t('admin.presentationEmbedRequired', locale),
      embedInvalid: t('admin.presentationEmbedInvalid', locale),
      slideMinRequired: t('admin.presentationSlideMinRequired', locale),
    });
  }
</script>

<div class="video-source-panel">
  <p class="video-source-label">{t('admin.presentationSourceLabel', locale)}</p>

  <div class="video-source-modes" role="radiogroup" aria-label={t('admin.presentationSourceLabel', locale)}>
    <button
      type="button"
      class="video-source-mode"
      class:video-source-mode--active={form.deliveryMode === 'upload'}
      disabled={disabled || uploading}
      onclick={() => (form = { ...form, deliveryMode: 'upload' })}
    >
      <span class="video-source-mode-icon" aria-hidden="true">⬆</span>
      <span class="video-source-mode-title">{t('admin.presentationModeUpload', locale)}</span>
      <span class="video-source-mode-desc">{t('admin.presentationModeUploadHint', locale)}</span>
    </button>
    <button
      type="button"
      class="video-source-mode"
      class:video-source-mode--active={form.deliveryMode === 'embed'}
      disabled={disabled || uploading}
      onclick={() => (form = { ...form, deliveryMode: 'embed' })}
    >
      <span class="video-source-mode-icon" aria-hidden="true">📊</span>
      <span class="video-source-mode-title">{t('admin.presentationModeEmbed', locale)}</span>
      <span class="video-source-mode-desc">{t('admin.presentationModeEmbedHint', locale)}</span>
    </button>
  </div>

  {#if form.deliveryMode === 'upload'}
    <div
      class="video-upload-zone"
      class:video-upload-zone--drag={dragOver}
      class:video-upload-zone--ready={Boolean(form.fileKey)}
      ondragover={(e) => {
        e.preventDefault();
        if (!disabled && !uploading) dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
    >
      {#if uploading}
        <p>{t('admin.presentationUploading', locale)}</p>
      {:else if form.fileName || form.fileKey}
        <p class="video-upload-name">{form.fileName ?? form.fileKey}</p>
        <p class="video-upload-hint">{t('admin.presentationUploadReady', locale)}</p>
        <button type="button" class="btn btn-ghost btn-sm" disabled={disabled} onclick={clearUpload}>
          {t('admin.presentationReplaceFile', locale)}
        </button>
      {:else}
        <p>{t('admin.presentationUploadDrop', locale)}</p>
        <label class="btn btn-sm video-upload-btn">
          {t('admin.presentationChooseFile', locale)}
          <input
            type="file"
            accept=".pdf,.ppt,.pptx,.pps,.ppsx,.pptm,.odp,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.slideshow,application/vnd.oasis.opendocument.presentation"
            hidden
            disabled={disabled}
            onchange={onFileInput}
          />
        </label>
        <p class="video-upload-hint">{t('admin.presentationUploadFormats', locale)}</p>
      {/if}
    </div>
  {:else}
    <div class="video-embed-panel">
      <div class="video-embed-tabs" role="tablist">
        {#each ['google_slides', 'onedrive', 'external'] as provider}
          <button
            type="button"
            class="video-embed-tab"
            class:video-embed-tab--active={form.embedProvider === provider}
            disabled={disabled}
            onclick={() => (form = { ...form, embedProvider: provider as typeof form.embedProvider })}
          >
            {t(`admin.presentationProvider.${provider}`, locale)}
          </button>
        {/each}
      </div>
      <label class="video-embed-field">
        <span>{t(`admin.presentationProviderUrl.${form.embedProvider}`, locale)}</span>
        <input
          type="url"
          bind:value={form.embedInput}
          disabled={disabled}
          placeholder={t(`admin.presentationProviderPlaceholder.${form.embedProvider}`, locale)}
        />
      </label>
      <p class="video-upload-hint">{t(`admin.presentationProviderHint.${form.embedProvider}`, locale)}</p>
    </div>
  {/if}

  {#if uploadError}
    <p class="video-source-error">{uploadError}</p>
  {/if}

  {#if preview && form.deliveryMode === 'embed'}
    <p class="video-preview-line">
      <span>{t('admin.presentationPreview', locale)}:</span>
      <code>{preview}</code>
    </p>
  {/if}

  <div class="video-completion-panel">
    <p class="video-source-label">{t('admin.presentationCompletionLabel', locale)}</p>
    <div class="video-completion-modes" role="radiogroup" aria-label={t('admin.presentationCompletionLabel', locale)}>
      <button
        type="button"
        class="video-embed-tab"
        class:video-embed-tab--active={form.completionMode === 'manual_confirm'}
        disabled={disabled}
        onclick={() => (form = { ...form, completionMode: 'manual_confirm' })}
      >
        {t('admin.presentationCompletion.manual', locale)}
      </button>
      <button
        type="button"
        class="video-embed-tab"
        class:video-embed-tab--active={form.completionMode === 'view_all_slides'}
        disabled={disabled}
        onclick={() => (form = { ...form, completionMode: 'view_all_slides' })}
      >
        {t('admin.presentationCompletion.viewAll', locale)}
      </button>
    </div>
    <p class="video-upload-hint">
      {form.completionMode === 'manual_confirm'
        ? t('admin.presentationCompletion.manualHint', locale)
        : t('admin.presentationCompletion.viewAllHint', locale)}
    </p>
    {#if form.completionMode === 'view_all_slides'}
      <div class="slide-timing-panel">
        <div class="slide-timing-header">
          <p class="slide-timing-title">{t('admin.presentationSlideTimingTitle', locale)}</p>
          {#if detectingSlides}
            <span class="slide-timing-badge">{t('admin.presentationSlideDetecting', locale)}</span>
          {:else if form.slideCount}
            <span class="slide-timing-badge slide-timing-badge--ready">
              {t('admin.presentationSlideCount', locale).replace('{count}', String(form.slideCount))}
            </span>
          {/if}
        </div>

        <div class="slide-timing-global">
          <div class="slide-timing-global-copy">
            <span class="slide-timing-global-label">{t('admin.presentationSlideMinGlobalLabel', locale)}</span>
            <span class="slide-timing-global-hint">{t('admin.presentationSlideMinGlobalHint', locale)}</span>
          </div>
          <div class="slide-timing-stepper">
            <button
              type="button"
              class="slide-timing-stepper-btn"
              disabled={disabled || globalSlideMin <= 0}
              onclick={() => setGlobalSlideMin(String(Math.max(0, globalSlideMin - 1)))}
              aria-label={t('admin.presentationSlideMinDecrease', locale)}
            >
              −
            </button>
            <input
              type="number"
              min="0"
              step="1"
              class="slide-timing-stepper-input"
              value={form.slideMinSeconds ?? ''}
              disabled={disabled}
              placeholder="0"
              oninput={(e) => setGlobalSlideMin((e.currentTarget as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="slide-timing-stepper-btn"
              disabled={disabled}
              onclick={() => setGlobalSlideMin(String(globalSlideMin + 1))}
              aria-label={t('admin.presentationSlideMinIncrease', locale)}
            >
              +
            </button>
            <span class="slide-timing-unit">{t('admin.presentationSlideMinUnit', locale)}</span>
          </div>
        </div>

        {#if form.slideCount && form.slideCount > 0}
          <p class="video-upload-hint">{t('admin.presentationSlideMinPerSlideHint', locale)}</p>
          <div class="slide-timing-grid">
            {#each visibleSlideIndices as slideIndex (slideIndex)}
              {@const effective = effectiveForSlide(slideIndex)}
              <div
                class="slide-timing-card"
                class:slide-timing-card--custom={hasCustomOverride(slideIndex)}
              >
                <div class="slide-timing-card-head">
                  <span class="slide-timing-card-index">
                    {t('admin.presentationSlideNumber', locale).replace('{number}', String(slideIndex + 1))}
                  </span>
                  {#if effective > 0}
                    <span class="slide-timing-effective">
                      {t('admin.presentationSlideEffective', locale).replace('{seconds}', String(effective))}
                    </span>
                  {/if}
                </div>
                <div class="slide-timing-stepper slide-timing-stepper--compact">
                  <button
                    type="button"
                    class="slide-timing-stepper-btn"
                    disabled={disabled || effective <= 0}
                    onclick={() => adjustSlideOverride(slideIndex, -1)}
                    aria-label={t('admin.presentationSlideMinDecrease', locale)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    class="slide-timing-stepper-input"
                    value={slideOverrideValue(slideIndex)}
                    disabled={disabled}
                    placeholder={globalSlideMin > 0 ? String(globalSlideMin) : '0'}
                    oninput={(e) => setSlideOverride(slideIndex, (e.currentTarget as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    class="slide-timing-stepper-btn"
                    disabled={disabled}
                    onclick={() => adjustSlideOverride(slideIndex, 1)}
                    aria-label={t('admin.presentationSlideMinIncrease', locale)}
                  >
                    +
                  </button>
                </div>
              </div>
            {/each}
          </div>
          {#if slideIndices.length > 12}
            <button
              type="button"
              class="btn btn-ghost btn-sm slide-timing-expand"
              onclick={() => (slideTimingExpanded = !slideTimingExpanded)}
            >
              {slideTimingExpanded
                ? t('admin.presentationSlideShowLess', locale)
                : t('admin.presentationSlideShowAll', locale).replace('{count}', String(slideIndices.length))}
            </button>
          {/if}
        {:else if canInspectSlides && !detectingSlides}
          <p class="video-upload-hint">{t('admin.presentationSlideDetectHint', locale)}</p>
        {:else if !canInspectSlides}
          <label class="video-embed-field">
            <span>{t('admin.presentationSlideMinLabel', locale)}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.slideMinSeconds ?? ''}
              disabled={disabled}
              placeholder={t('admin.presentationSlideMinPlaceholder', locale)}
              oninput={(e) => setGlobalSlideMin((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <p class="video-upload-hint">{t('admin.presentationSlideMinHint', locale)}</p>
        {/if}
      </div>
    {/if}
    <label class="evaluation-switch-row presentation-download-row">
      <span class="presentation-download-label">{t('admin.presentationAllowDownload', locale)}</span>
      <span class="evaluation-switch">
        <input type="checkbox" bind:checked={form.allowDownload} disabled={disabled} />
        <span class="evaluation-switch-slider" aria-hidden="true"></span>
      </span>
    </label>
  </div>
</div>

<style>
  .video-source-panel {
    display: grid;
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-elevated, rgba(255, 255, 255, 0.5));
  }

  .video-source-label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted);
  }

  .video-source-modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .video-source-mode {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg-elevated, #fff);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    box-shadow: none;
    transform: none;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .video-source-mode:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
    color: var(--color-text);
    box-shadow: none;
    transform: none;
  }

  .video-source-mode--active {
    border-color: var(--color-primary);
    background: var(--color-primary-muted);
    box-shadow: 0 0 0 1px var(--color-primary);
    color: var(--color-text);
  }

  .video-source-mode--active:hover:not(:disabled) {
    background: var(--color-primary-muted);
    border-color: var(--color-primary);
    color: var(--color-text);
    box-shadow: 0 0 0 1px var(--color-primary);
    transform: none;
  }

  .video-source-mode-icon {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
  }

  .video-source-mode--active .video-source-mode-icon {
    color: var(--color-primary-hover);
  }

  .video-source-mode-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .video-source-mode--active .video-source-mode-title {
    color: var(--color-primary-hover);
  }

  .video-source-mode-desc {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .video-upload-zone {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    padding: 1rem;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg-elevated, #fff);
    color: var(--color-text);
  }

  .video-upload-zone--drag {
    border-color: var(--color-primary);
    background: rgba(99, 102, 241, 0.05);
  }

  .video-upload-zone--ready {
    border-style: solid;
  }

  .video-upload-name {
    margin: 0;
    font-weight: 600;
    word-break: break-all;
  }

  .video-upload-hint,
  .video-preview-line {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.45;
  }

  .video-upload-btn {
    cursor: pointer;
  }

  .video-embed-panel {
    display: grid;
    gap: 0.625rem;
  }

  .video-embed-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .video-embed-tab {
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-bg-elevated, #fff);
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    box-shadow: none;
    transform: none;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .video-embed-tab:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
    color: var(--color-text);
    box-shadow: none;
    transform: none;
  }

  .video-embed-tab--active {
    border-color: var(--color-primary);
    color: var(--color-primary-hover);
    background: var(--color-primary-muted);
    font-weight: 600;
  }

  .video-embed-field {
    display: grid;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--color-text);
  }

  .video-embed-field input {
    width: 100%;
  }

  .video-completion-panel {
    display: grid;
    gap: 0.5rem;
  }

  .video-completion-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .video-source-error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.8125rem;
  }

  .video-preview-line code {
    font-size: 0.75rem;
    word-break: break-all;
  }

  @media (max-width: 640px) {
    .video-source-modes {
      grid-template-columns: 1fr;
    }
  }

  .slide-timing-panel {
    display: grid;
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated, #fff);
  }

  .slide-timing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .slide-timing-title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .slide-timing-badge {
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    background: var(--color-surface-hover);
  }

  .slide-timing-badge--ready {
    color: var(--color-primary-hover);
    background: var(--color-primary-muted);
  }

  .slide-timing-global {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem;
    border-radius: var(--radius);
    background: var(--color-surface-elevated, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--color-border);
  }

  .slide-timing-global-copy {
    display: grid;
    gap: 0.15rem;
    min-width: min(100%, 14rem);
  }

  .slide-timing-global-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .slide-timing-global-hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .slide-timing-stepper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .slide-timing-stepper--compact {
    width: 100%;
    max-width: 100%;
  }

  .slide-timing-stepper-btn {
    flex: 0 0 1.5rem;
    width: 1.5rem;
    height: 1.5rem;
    min-width: 1.5rem;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 0.375rem);
    background: var(--color-bg-elevated, #fff);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
    transform: none;
  }

  .slide-timing-stepper-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
    color: var(--color-text);
    box-shadow: none;
    transform: none;
  }

  .slide-timing-stepper-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .slide-timing-stepper-input {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    max-width: 100%;
    text-align: center;
    padding: 0.25rem 0.125rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 0.375rem);
    background: var(--color-bg-elevated, #fff);
    font-size: 0.8125rem;
    -moz-appearance: textfield;
  }

  .slide-timing-stepper-input::-webkit-outer-spin-button,
  .slide-timing-stepper-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .slide-timing-global .slide-timing-stepper-input {
    flex: 0 0 2.75rem;
    width: 2.75rem;
  }

  .slide-timing-unit {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    min-width: 0.75rem;
  }

  .slide-timing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.75rem, 1fr));
    gap: 0.5rem;
  }

  .slide-timing-card {
    display: grid;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg-elevated, #fff);
    overflow: hidden;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .slide-timing-card--custom {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary-muted);
  }

  .slide-timing-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-width: 0;
  }

  .slide-timing-card-index {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-secondary);
  }

  .slide-timing-effective {
    flex-shrink: 0;
    padding: 0.1rem 0.35rem;
    border-radius: 999px;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--color-primary-hover);
    background: var(--color-primary-muted);
    white-space: nowrap;
  }

  .slide-timing-expand {
    justify-self: start;
  }

  @media (max-width: 640px) {
    .slide-timing-global {
      align-items: stretch;
    }

    .slide-timing-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>

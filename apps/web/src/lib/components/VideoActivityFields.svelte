<script lang="ts">
  import { token } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import {
    type VideoFormState,
    validateVideoForm,
    videoPreviewLabel,
  } from '$lib/video-config';

  let {
    courseId,
    locale,
    disabled = false,
    form = $bindable(),
  }: {
    courseId: string;
    locale: Locale;
    disabled?: boolean;
    form: VideoFormState;
  } = $props();

  let selectedFile = $state<File | null>(null);
  let uploading = $state(false);
  let uploadError = $state('');
  let dragOver = $state(false);
  let requiredWatchInput = $state('');

  const preview = $derived(videoPreviewLabel(form));

  $effect(() => {
    const seconds = Number(form.requiredWatchSeconds ?? 0);
    if (!seconds || Number.isNaN(seconds)) {
      requiredWatchInput = '';
      return;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    requiredWatchInput = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  function parseWatchDuration(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/^(\d{2,3}):([0-5]\d)$/);
    if (!match) return null;
    const mins = Number.parseInt(match[1], 10);
    const secs = Number.parseInt(match[2], 10);
    return mins * 60 + secs;
  }

  function applyRequiredWatchInput() {
    if (!requiredWatchInput.trim()) {
      form = { ...form, requiredWatchSeconds: undefined };
      return;
    }
    const parsed = parseWatchDuration(requiredWatchInput);
    if (!parsed) return;
    form = {
      ...form,
      requiredWatchSeconds: parsed,
    };
  }

  async function uploadSelectedFile(file: File) {
    uploadError = '';
    uploading = true;
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('courseId', courseId);

      const authToken = get(token);
      const res = await fetch('/api/media/videos', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `Chyba ${res.status}`);
      }

      const data = body as { fileKey: string; videoUrl: string; fileName: string };
      form = {
        ...form,
        deliveryMode: 'upload',
        fileKey: data.fileKey,
        videoUrl: data.videoUrl,
        fileName: data.fileName,
      };
      selectedFile = file;
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
    selectedFile = null;
    form = { ...form, fileKey: undefined, videoUrl: undefined, fileName: undefined };
  }

  export function validate(): string | null {
    return validateVideoForm(form, {
      uploadRequired: t('admin.videoUploadRequired', locale),
      embedRequired: t('admin.videoEmbedRequired', locale),
      embedInvalid: t('admin.videoEmbedInvalid', locale),
      watchToEndNeedsNative: t('admin.videoWatchNativeOnly', locale),
      watchDurationNeedsTrackable: t('admin.videoWatchDurationTrackableOnly', locale),
      minWatchTimeRequired: t('admin.videoMinWatchRequired', locale),
    });
  }
</script>

<div class="video-source-panel">
  <p class="video-source-label">{t('admin.videoSourceLabel', locale)}</p>

  <div class="video-source-modes" role="radiogroup" aria-label={t('admin.videoSourceLabel', locale)}>
    <button
      type="button"
      class="video-source-mode"
      class:video-source-mode--active={form.deliveryMode === 'upload'}
      disabled={disabled || uploading}
      onclick={() => (form = { ...form, deliveryMode: 'upload' })}
    >
      <span class="video-source-mode-icon" aria-hidden="true">⬆</span>
      <span class="video-source-mode-title">{t('admin.videoModeUpload', locale)}</span>
      <span class="video-source-mode-desc">{t('admin.videoModeUploadHint', locale)}</span>
    </button>
    <button
      type="button"
      class="video-source-mode"
      class:video-source-mode--active={form.deliveryMode === 'embed'}
      disabled={disabled || uploading}
      onclick={() => (form = { ...form, deliveryMode: 'embed' })}
    >
      <span class="video-source-mode-icon" aria-hidden="true">▶</span>
      <span class="video-source-mode-title">{t('admin.videoModeEmbed', locale)}</span>
      <span class="video-source-mode-desc">{t('admin.videoModeEmbedHint', locale)}</span>
    </button>
  </div>

  <div class="video-completion-panel">
    <p class="video-source-label">{t('admin.videoCompletionLabel', locale)}</p>
    <div class="video-completion-modes" role="radiogroup" aria-label={t('admin.videoCompletionLabel', locale)}>
      <button
        type="button"
        class="video-embed-tab"
        class:video-embed-tab--active={form.completionMode === 'manual_confirm'}
        disabled={disabled}
        onclick={() => (form = { ...form, completionMode: 'manual_confirm' })}
      >
        {t('admin.videoCompletion.manual', locale)}
      </button>
      <button
        type="button"
        class="video-embed-tab"
        class:video-embed-tab--active={form.completionMode === (form.deliveryMode === 'embed' ? 'min_watch_time' : 'watch_to_end')}
        disabled={disabled}
        onclick={() => (form = { ...form, completionMode: form.deliveryMode === 'embed' ? 'min_watch_time' : 'watch_to_end' })}
      >
        {form.deliveryMode === 'embed'
          ? t('admin.videoCompletion.minWatch', locale)
          : t('admin.videoCompletion.watchToEnd', locale)}
      </button>
    </div>
    <p class="video-upload-hint">
      {form.completionMode === 'manual_confirm'
        ? t('admin.videoCompletion.manualHint', locale)
        : form.completionMode === 'min_watch_time'
          ? t('admin.videoCompletion.minWatchHint', locale)
          : t('admin.videoCompletion.watchToEndHint', locale)}
    </p>
    {#if form.completionMode === 'watch_to_end' && form.deliveryMode === 'embed' && form.embedProvider !== 'external'}
      <p class="video-source-error">{t('admin.videoWatchNativeOnly', locale)}</p>
    {/if}
    {#if form.completionMode === 'min_watch_time'}
      <label class="video-embed-field">
        <span>{t('admin.videoWatchDurationLabel', locale)}</span>
        <input
          type="text"
          bind:value={requiredWatchInput}
          disabled={disabled}
          placeholder={t('admin.videoWatchDurationPlaceholder', locale)}
          oninput={applyRequiredWatchInput}
          onblur={applyRequiredWatchInput}
        />
      </label>
      <p class="video-upload-hint">{t('admin.videoWatchDurationHint', locale)}</p>
    {/if}
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
        <p>{t('admin.videoUploading', locale)}</p>
      {:else if form.fileName || form.fileKey}
        <p class="video-upload-name">{form.fileName ?? form.fileKey}</p>
        <p class="video-upload-hint">{t('admin.videoUploadReady', locale)}</p>
        <button type="button" class="btn btn-ghost btn-sm" disabled={disabled} onclick={clearUpload}>
          {t('admin.videoReplaceFile', locale)}
        </button>
      {:else}
        <p>{t('admin.videoUploadDrop', locale)}</p>
        <label class="btn btn-sm video-upload-btn">
          {t('admin.videoChooseFile', locale)}
          <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/ogg" hidden disabled={disabled} onchange={onFileInput} />
        </label>
        <p class="video-upload-hint">{t('admin.videoUploadFormats', locale)}</p>
      {/if}
    </div>
  {:else}
    <div class="video-embed-panel">
      <div class="video-embed-tabs" role="tablist">
        {#each ['youtube', 'vimeo', 'external'] as provider}
          <button
            type="button"
            class="video-embed-tab"
            class:video-embed-tab--active={form.embedProvider === provider}
            disabled={disabled}
            onclick={() => (form = { ...form, embedProvider: provider as typeof form.embedProvider })}
          >
            {t(`admin.videoProvider.${provider}`, locale)}
          </button>
        {/each}
      </div>
      <label class="video-embed-field">
        <span>{t(`admin.videoProviderUrl.${form.embedProvider}`, locale)}</span>
        <input
          type="url"
          bind:value={form.embedInput}
          disabled={disabled}
          placeholder={t(`admin.videoProviderPlaceholder.${form.embedProvider}`, locale)}
        />
      </label>
      <p class="video-upload-hint">{t(`admin.videoProviderHint.${form.embedProvider}`, locale)}</p>
    </div>
  {/if}

  {#if uploadError}
    <p class="video-source-error">{uploadError}</p>
  {/if}

  {#if preview && form.deliveryMode === 'embed'}
    <p class="video-preview-line">
      <span>{t('admin.videoPreview', locale)}:</span>
      <code>{preview}</code>
    </p>
  {/if}
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

  .video-source-mode--active .video-source-mode-desc {
    color: var(--color-text-secondary);
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

  .video-completion-panel {
    display: grid;
    gap: 0.5rem;
  }

  .video-completion-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
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

  .video-embed-tab--active:hover:not(:disabled) {
    background: var(--color-primary-muted);
    border-color: var(--color-primary);
    color: var(--color-primary-hover);
    box-shadow: none;
    transform: none;
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
</style>

<script lang="ts">
  import { token } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import {
    type ScormFormState,
    emptyScormForm,
    validateScormForm,
    type ScormVersion,
    type ScormScoSpec,
  } from '$lib/scorm-config';

  let {
    courseId,
    locale,
    disabled = false,
    form = $bindable(),
  }: {
    courseId: string;
    locale: Locale;
    disabled?: boolean;
    form: ScormFormState;
  } = $props();

  let uploading = $state(false);
  let uploadError = $state('');
  let dragOver = $state(false);
  let forcedVersion = $state<ScormVersion | ''>('');
  let selectedFileName = $state<string>('');
  let uploadPercent = $state<number | null>(null);
  let uploadedBytes = $state(0);
  let totalBytes = $state(0);

  function formatBytes(bytes: number) {
    if (!bytes || bytes < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    const digits = idx === 0 ? 0 : idx === 1 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[idx]}`;
  }

  function uploadMessages() {
    return {
      uploadRequired: t('admin.scormUploadRequired', locale),
      scoRequired: t('admin.scormScoRequired', locale),
    };
  }

  async function uploadSelectedFile(file: File) {
    uploadError = '';
    selectedFileName = file.name || '';
    uploading = true;
    uploadPercent = 0;
    uploadedBytes = 0;
    totalBytes = file.size || 0;
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('courseId', courseId);
      if (forcedVersion) fd.set('version', forcedVersion);

      const authToken = get(token);
      const data = await new Promise<{
        packageId: string;
        title: string;
        version: ScormVersion;
        scos: ScormScoSpec[];
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media/scorm', true);
        xhr.withCredentials = true;
        if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.responseType = 'json';

        xhr.upload.onprogress = (evt) => {
          if (!uploading) return;
          if (evt.lengthComputable) {
            totalBytes = evt.total;
            uploadedBytes = evt.loaded;
            uploadPercent = Math.round((evt.loaded / evt.total) * 100);
          } else {
            // Keep bar visible even if total is unknown.
            uploadedBytes = evt.loaded;
            uploadPercent = null;
          }
        };

        xhr.onload = () => {
          const body = xhr.response ?? null;
          if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body);
          const message =
            (body && typeof body === 'object' && 'error' in body && typeof (body as any).error === 'string'
              ? (body as any).error
              : xhr.statusText) || `Chyba ${xhr.status}`;
          reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error('Upload failed.'));
        xhr.onabort = () => reject(new Error('Upload aborted.'));
        xhr.send(fd);
      });

      form = {
        ...form,
        deliveryMode: 'upload',
        packageId: data.packageId,
        title: data.title,
        version: data.version,
        scos: data.scos,
        selectedScoId: data.scos?.[0]?.id,
      };
    } catch (e) {
      uploadError = (e as Error).message;
    } finally {
      uploading = false;
      uploadPercent = null;
    }
  }

  async function onFileInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    selectedFileName = file.name || '';
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
    form = emptyScormForm();
    uploadError = '';
    forcedVersion = '';
    selectedFileName = '';
  }

  export function validate(): string | null {
    return validateScormForm(form, uploadMessages());
  }
</script>

<div class="video-source-panel">
  <p class="video-source-label">{t('admin.scormSourceLabel', locale)}</p>

  <div class="video-upload-zone" class:video-upload-zone--drag={dragOver} class:video-upload-zone--ready={Boolean(form.packageId)}
    ondragover={(e) => {
      e.preventDefault();
      if (!disabled && !uploading) dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
  >
    {#if uploading}
      <div class="scorm-upload-header">
        <p>{t('admin.scormUploading', locale)}</p>
        {#if selectedFileName}
          <span class="scorm-file-chip">{selectedFileName}</span>
        {/if}
      </div>
      <div class="scorm-progress">
        <div
          class="scorm-progress-bar"
          style={uploadPercent === null ? undefined : `--scorm-progress: ${uploadPercent}%`}
          data-indeterminate={uploadPercent === null ? 'true' : 'false'}
        >
          <div class="scorm-progress-fill"></div>
        </div>
        <div class="scorm-progress-meta">
          <span>{uploadPercent === null ? '…' : `${uploadPercent}%`}</span>
          <span>{formatBytes(uploadedBytes)}{totalBytes ? ` / ${formatBytes(totalBytes)}` : ''}</span>
        </div>
      </div>
    {:else if form.packageId}
      <p class="video-upload-name">{selectedFileName || form.title || form.packageId}</p>
      <p class="video-upload-hint">{t('admin.scormUploadReady', locale)}</p>
      <button type="button" class="btn btn-ghost btn-sm" disabled={disabled} onclick={clearUpload}>
        {t('admin.scormReplaceFile', locale)}
      </button>
    {:else}
      <div class="scorm-drop-title">
        <span class="scorm-drop-icon" aria-hidden="true">⬆</span>
        <div class="scorm-drop-text">
          <p class="scorm-drop-head">{t('admin.scormUploadDrop', locale)}</p>
          <p class="scorm-drop-sub">{t('admin.scormUploadFormats', locale)}</p>
        </div>
      </div>

      <div class="scorm-controls">
        <label class="scorm-control">
          <span>{t('admin.scormVersionLabel', locale)}</span>
          <select bind:value={forcedVersion} disabled={disabled}>
            <option value="">{t('admin.scormVersionAuto', locale)}</option>
            <option value="scorm_12">{t('admin.scormVersion12', locale)}</option>
            <option value="scorm_2004">{t('admin.scormVersion2004', locale)}</option>
          </select>
        </label>

        <div class="scorm-actions">
          <label class="btn btn-sm video-upload-btn">
            {t('admin.scormChooseFile', locale)}
            <input type="file" accept="application/zip,.zip" hidden disabled={disabled} onchange={onFileInput} />
          </label>
          {#if selectedFileName}
            <span class="scorm-file-chip">{selectedFileName}</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  {#if uploadError}
    <p class="video-source-error">{uploadError}</p>
  {/if}

  {#if form.packageId && form.scos && form.scos.length > 0}
    <label class="video-embed-field">
      <span>{t('admin.scormScoLabel', locale)}</span>
      <select
        disabled={disabled}
        bind:value={form.selectedScoId}
        oninput={(e) => (form = { ...form, selectedScoId: (e.currentTarget as HTMLSelectElement).value })}
      >
        {#each form.scos as sco (sco.id)}
          <option value={sco.id}>{sco.title} ({sco.launch})</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .video-upload-btn {
    color: #fff;
  }

  .video-upload-btn:hover {
    color: #fff;
  }

  .scorm-drop-title {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .scorm-drop-icon {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    flex: 0 0 auto;
  }

  .scorm-drop-text {
    min-width: 0;
  }

  .scorm-drop-head {
    margin: 0;
    font-weight: 600;
  }

  .scorm-drop-sub {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--color-muted);
  }

  .scorm-controls {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .scorm-control {
    display: grid;
    gap: 0.35rem;
  }

  .scorm-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .scorm-progress {
    margin-top: 0.75rem;
    width: 100%;
    display: grid;
    gap: 0.4rem;
  }

  .scorm-progress-bar {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-border) 40%, transparent);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .scorm-progress-fill {
    height: 100%;
    width: var(--scorm-progress, 0%);
    background: var(--color-primary, #6d5efc);
    border-radius: 999px;
    transition: width 120ms linear;
  }

  .scorm-progress-bar[data-indeterminate='true'] .scorm-progress-fill {
    width: 40%;
    animation: scormIndeterminate 1.1s ease-in-out infinite;
  }

  .scorm-progress-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--color-muted);
    font-size: 0.8rem;
  }

  @keyframes scormIndeterminate {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(260%);
    }
  }

  .scorm-upload-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    width: 100%;
  }

  .scorm-file-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.78rem;
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>


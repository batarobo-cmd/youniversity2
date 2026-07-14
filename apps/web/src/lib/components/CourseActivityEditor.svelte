<script lang="ts">
  import { ACTIVITY_TYPES } from '@youniversity2/shared';
  import { serverMutate } from '$lib/client/form-action';
  import { t } from '$lib/i18n';
  import { normalizeActivityType } from '$lib/activity-types';
  import { createAutosave, type AutosaveStatus as AutosaveState } from '$lib/autosave';
  import AutosaveStatus from '$lib/components/AutosaveStatus.svelte';
  import VideoActivityFields from '$lib/components/VideoActivityFields.svelte';
  import PresentationActivityFields from '$lib/components/PresentationActivityFields.svelte';
  import ScormActivityFields from '$lib/components/ScormActivityFields.svelte';
  import {
    configFromVideoForm,
    emptyVideoForm,
    validateVideoForm,
    videoFormFromConfig,
    type VideoFormState,
  } from '$lib/video-config';
  import {
    configFromPresentationForm,
    emptyPresentationForm,
    presentationFormFromConfig,
    presentationSourceSummary as presentationSummary,
    validatePresentationForm,
    type PresentationFormState,
  } from '$lib/presentation-config';
  import {
    configFromScormForm,
    emptyScormForm,
    scormFormFromConfig,
    validateScormForm,
    type ScormFormState,
  } from '$lib/scorm-config';
  import type { Locale } from '@youniversity2/shared';

  type ActivityRow = {
    id: string;
    type: string;
    title: string;
    content?: string;
    sortOrder: number;
    isRequired: boolean;
    config?: Record<string, unknown>;
  };

  type ModuleRow = {
    id: string;
    title: string;
    sortOrder: number;
    activities?: ActivityRow[];
    lessons?: ActivityRow[];
  };

  let {
    courseId,
    modules = [],
    locale,
    onChange,
  }: {
    courseId: string;
    modules: ModuleRow[];
    locale: Locale;
    onChange: () => void | Promise<void>;
  } = $props();

  let saving = $state(false);
  let error = $state('');
  let editingId = $state<string | null>(null);
  let editTitle = $state('');
  let editContent = $state('');
  let editConfigUrl = $state('');
  let newModuleTitle = $state('');
  let addingModule = $state(false);
  let addingToModule = $state<string | null>(null);
  let newActivityType = $state<(typeof ACTIVITY_TYPES)[number]>('text');
  let newActivityTitle = $state('');
  let newActivityDescription = $state('');
  let newVideoForm = $state<VideoFormState>(emptyVideoForm());
  let editVideoForm = $state<VideoFormState>(emptyVideoForm());
  let newPresentationForm = $state<PresentationFormState>(emptyPresentationForm());
  let editPresentationForm = $state<PresentationFormState>(emptyPresentationForm());
  let newScormForm = $state<ScormFormState>(emptyScormForm());
  let editScormForm = $state<ScormFormState>(emptyScormForm());
  let dragModuleId = $state<string | null>(null);
  let dragActivity = $state<{ id: string; moduleId: string } | null>(null);
  let dropTargetModuleId = $state<string | null>(null);
  let dropBeforeActivityId = $state<string | null>(null);
  let dropBeforeModuleId = $state<string | null>(null);
  let autosaveStatus = $state<AutosaveState>('idle');
  let autosaveError = $state('');
  let editBaseline = $state<string | null>(null);

  const moduleTitleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const activityAutosave = createAutosave({
    debounceMs: 800,
    onStatus: (status, err) => {
      autosaveStatus = status;
      autosaveError = err ?? '';
    },
    onSave: async () => {
      if (!editingId) return false;
      const activity = findActivityById(editingId);
      if (!activity) return false;
      if (!isTextType(activity.type) && !editTitle.trim()) return false;
      await persistActivity(activity, { closeAfterSave: false });
      return true;
    },
  });

  const editDraftKey = $derived.by(() =>
    JSON.stringify({
      editTitle,
      editContent,
      editConfigUrl,
      editVideoForm,
      editPresentationForm,
      editScormForm,
    }),
  );

  function isDraggingModule() {
    return dragModuleId !== null;
  }

  function isDraggingActivity() {
    return dragActivity !== null;
  }

  function allowDrop(e: DragEvent) {
    if (!isDraggingModule() && !isDraggingActivity()) return false;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    return true;
  }

  function startModuleDrag(e: DragEvent, moduleId: string) {
    dragModuleId = moduleId;
    dragActivity = null;
    dropBeforeModuleId = null;
    e.dataTransfer?.setData('text/plain', `module:${moduleId}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function startActivityDrag(e: DragEvent, activityId: string, moduleId: string) {
    dragActivity = { id: activityId, moduleId };
    dragModuleId = null;
    dropBeforeModuleId = null;
    e.dataTransfer?.setData('text/plain', `activity:${activityId}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  const orderedModules = $derived(
    [...modules]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((mod) => ({
        ...mod,
        activities: [...activitiesFor(mod)].sort((a, b) => a.sortOrder - b.sortOrder),
      })),
  );

  function activitiesFor(mod: ModuleRow): ActivityRow[] {
    return (mod.activities ?? mod.lessons ?? []) as ActivityRow[];
  }

  function isTextType(type: string) {
    return normalizeActivityType(type) === 'text';
  }

  function isVideoType(type: string) {
    return normalizeActivityType(type) === 'video';
  }

  function isPresentationType(type: string) {
    return normalizeActivityType(type) === 'presentation';
  }

  function isScormType(type: string) {
    return normalizeActivityType(type) === 'scorm';
  }

  function videoValidationMessages() {
    return {
      uploadRequired: t('admin.videoUploadRequired', locale),
      embedRequired: t('admin.videoEmbedRequired', locale),
      embedInvalid: t('admin.videoEmbedInvalid', locale),
      watchToEndNeedsNative: t('admin.videoWatchNativeOnly', locale),
      watchDurationNeedsTrackable: t('admin.videoWatchDurationTrackableOnly', locale),
    };
  }

  function presentationValidationMessages() {
    return {
      uploadRequired: t('admin.presentationUploadRequired', locale),
      embedRequired: t('admin.presentationEmbedRequired', locale),
      embedInvalid: t('admin.presentationEmbedInvalid', locale),
      slideMinRequired: t('admin.presentationSlideMinRequired', locale),
    };
  }

  function scormValidationMessages() {
    return {
      uploadRequired: t('admin.scormUploadRequired', locale),
      scoRequired: t('admin.scormScoRequired', locale),
    };
  }

  function videoSourceSummary(config?: Record<string, unknown>) {
    if (!config) return '';
    if (config.videoSource === 'upload' || config.fileKey) {
      return (config.fileName as string) || t('admin.videoModeUpload', locale);
    }
    if (config.videoSource === 'vimeo') return 'Vimeo';
    if (config.videoSource === 'external') return t('admin.videoProvider.external', locale);
    return 'YouTube';
  }

  function presentationSourceSummary(config?: Record<string, unknown>) {
    return presentationSummary(config, {
      upload: t('admin.presentationModeUpload', locale),
      googleSlides: t('admin.presentationProvider.google_slides', locale),
      onedrive: t('admin.presentationProvider.onedrive', locale),
      external: t('admin.presentationProvider.external', locale),
    });
  }

  function getNewActivityValidationError(): string | null {
    if (isTextType(newActivityType)) return null;

    if (!newActivityTitle.trim()) {
      return t('admin.activityTitleRequired', locale);
    }

    if (isVideoType(newActivityType)) {
      return validateVideoForm(newVideoForm, videoValidationMessages());
    }

    if (isPresentationType(newActivityType)) {
      return validatePresentationForm(newPresentationForm, presentationValidationMessages());
    }

    if (isScormType(newActivityType)) {
      return validateScormForm(newScormForm, scormValidationMessages());
    }

    return null;
  }

  function activityLabel(type: string) {
    const normalized = normalizeActivityType(type);
    const key = `activity.type.${normalized}` as Parameters<typeof t>[0];
    return t(key, locale);
  }

  function contentFieldLabel(type: string) {
    return isTextType(type)
      ? t('admin.textFieldContent', locale)
      : t('admin.activityDescription', locale);
  }

  function textPreview(content?: string) {
    const trimmed = content?.trim();
    if (!trimmed) return t('admin.textFieldEmpty', locale);
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  }

  function findActivityById(activityId: string): ActivityRow | null {
    for (const mod of orderedModules) {
      const match = mod.activities.find((item) => item.id === activityId);
      if (match) return match;
    }
    return null;
  }

  function queueModuleTitleSave(moduleId: string, title: string) {
    const existing = moduleTitleTimers.get(moduleId);
    if (existing) clearTimeout(existing);
    moduleTitleTimers.set(
      moduleId,
      setTimeout(() => {
        moduleTitleTimers.delete(moduleId);
        void saveModuleTitle(moduleId, title);
      }, 800),
    );
  }

  $effect(() => {
    if (!editingId) {
      editBaseline = null;
      activityAutosave.cancel();
      return;
    }

    const key = editDraftKey;
    if (editBaseline === null) {
      editBaseline = key;
      return;
    }
    if (key === editBaseline) return;
    activityAutosave.schedule();
  });

  async function run(action: () => Promise<void>) {
    saving = true;
    error = '';
    try {
      await action();
      await onChange();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function addModule() {
    const title = newModuleTitle.trim();
    if (!title) return;
    await run(async () => {
      await serverMutate('apiMutation', `/api/courses/${courseId}/modules`, 'POST', { title });
      newModuleTitle = '';
      addingModule = false;
    });
  }

  async function deleteModule(moduleId: string) {
    if (!confirm(t('admin.deleteModuleConfirm', locale))) return;
    await run(() => serverMutate('apiMutation', `/api/modules/${moduleId}`, 'DELETE'));
  }

  async function saveModuleTitle(moduleId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    await run(() => serverMutate('apiMutation', `/api/modules/${moduleId}`, 'PATCH', { title: trimmed }));
  }

  function moduleHasTextActivity(mod: ModuleRow) {
    return activitiesFor(mod).some((activity) => isTextType(activity.type));
  }

  function moduleHasNonTextActivities(mod: ModuleRow) {
    return activitiesFor(mod).some((activity) => !isTextType(activity.type));
  }

  function canAddActivity(mod: ModuleRow) {
    return !moduleHasTextActivity(mod);
  }

  function canAcceptActivityDrop(mod: ModuleRow) {
    return !moduleHasTextActivity(mod);
  }

  function allowedActivityTypes(mod: ModuleRow) {
    if (moduleHasNonTextActivities(mod) || moduleHasTextActivity(mod)) {
      return ACTIVITY_TYPES.filter((type) => type !== 'text');
    }
    return [...ACTIVITY_TYPES];
  }

  function startAddActivity(mod: ModuleRow) {
    if (!canAddActivity(mod)) return;
    addingToModule = mod.id;
    const types = allowedActivityTypes(mod);
    const preferred = types.includes(newActivityType) ? newActivityType : types[0];
    newActivityType = (preferred ?? 'presentation') as (typeof ACTIVITY_TYPES)[number];
    newActivityTitle = '';
    newActivityDescription = '';
    newVideoForm = emptyVideoForm();
    newPresentationForm = emptyPresentationForm();
    newScormForm = emptyScormForm();
  }

  async function addActivity(moduleId: string) {
    const content = newActivityDescription.trim();
    if (isTextType(newActivityType)) {
      await run(async () => {
        await serverMutate('apiMutation', `/api/modules/${moduleId}/activities`, 'POST', {
          type: 'text',
          content: content || undefined,
        });
        addingToModule = null;
        newActivityDescription = '';
      });
      return;
    }

    const title = newActivityTitle.trim();
    const validationError = getNewActivityValidationError();
    if (validationError) {
      error = validationError;
      return;
    }

    const config = isVideoType(newActivityType)
      ? configFromVideoForm(newVideoForm)
      : isPresentationType(newActivityType)
        ? configFromPresentationForm(newPresentationForm)
        : isScormType(newActivityType)
          ? configFromScormForm(newScormForm)
          : undefined;

    await run(async () => {
      await serverMutate('apiMutation', `/api/modules/${moduleId}/activities`, 'POST', {
        type: newActivityType,
        title,
        content: content || undefined,
        config,
      });
      addingToModule = null;
      newActivityTitle = '';
      newActivityDescription = '';
      newVideoForm = emptyVideoForm();
      newPresentationForm = emptyPresentationForm();
    });
  }

  function startEdit(activity: ActivityRow) {
    activityAutosave.cancel();
    editingId = activity.id;
    editTitle = activity.title;
    editContent = activity.content ?? '';
    const cfg = activity.config ?? {};
    if (isVideoType(activity.type)) {
      editVideoForm = videoFormFromConfig(cfg);
      editPresentationForm = emptyPresentationForm();
      editScormForm = emptyScormForm();
      editConfigUrl = '';
      return;
    }
    if (isPresentationType(activity.type)) {
      editPresentationForm = presentationFormFromConfig(cfg);
      editVideoForm = emptyVideoForm();
      editScormForm = emptyScormForm();
      editConfigUrl = '';
      return;
    }
    if (isScormType(activity.type)) {
      editScormForm = scormFormFromConfig(cfg);
      editVideoForm = emptyVideoForm();
      editPresentationForm = emptyPresentationForm();
      editConfigUrl = '';
      return;
    }
    editVideoForm = emptyVideoForm();
    editPresentationForm = emptyPresentationForm();
    editScormForm = emptyScormForm();
    editConfigUrl = (cfg.audioUrl as string) || '';
  }

  function configForType(type: string, url: string): Record<string, unknown> | undefined {
    const normalized = normalizeActivityType(type);
    if (!url.trim()) return undefined;
    if (normalized === 'audio') return { audioUrl: url.trim() };
    return undefined;
  }

  function showUrlField(type: string) {
    const normalized = normalizeActivityType(type);
    return normalized === 'audio';
  }

  async function persistActivity(activity: ActivityRow, options?: { closeAfterSave?: boolean }) {
    const normalized = normalizeActivityType(activity.type);
    let config: Record<string, unknown> | undefined;

    if (isVideoType(activity.type)) {
      const videoError = validateVideoForm(editVideoForm, videoValidationMessages());
      if (videoError) {
        error = videoError;
        throw new Error(videoError);
      }
      config = configFromVideoForm(editVideoForm);
    } else if (isPresentationType(activity.type)) {
      const presentationError = validatePresentationForm(
        editPresentationForm,
        presentationValidationMessages(),
      );
      if (presentationError) {
        error = presentationError;
        throw new Error(presentationError);
      }
      config = configFromPresentationForm(editPresentationForm);
    } else if (isScormType(activity.type)) {
      const scormError = validateScormForm(editScormForm, scormValidationMessages());
      if (scormError) {
        error = scormError;
        throw new Error(scormError);
      }
      config = configFromScormForm(editScormForm);
    } else {
      config = configForType(activity.type, editConfigUrl);
    }

    if (isTextType(activity.type)) {
      await run(() =>
        serverMutate('apiMutation', `/api/activities/${activity.id}`, 'PATCH', {
          content: editContent,
          config,
        }),
      );
      editBaseline = editDraftKey;
      if (options?.closeAfterSave) editingId = null;
      return;
    }

    const title = editTitle.trim();
    if (!title) return;

    await run(() =>
      serverMutate('apiMutation', `/api/activities/${activity.id}`, 'PATCH', {
        title,
        content: editContent,
        config,
        type: ACTIVITY_TYPES.includes(normalized as (typeof ACTIVITY_TYPES)[number])
          ? (normalized as (typeof ACTIVITY_TYPES)[number])
          : undefined,
      }),
    );
    editBaseline = editDraftKey;
    if (options?.closeAfterSave) editingId = null;
  }

  function cancelEdit() {
    activityAutosave.cancel();
    editingId = null;
    editBaseline = null;
    autosaveStatus = 'idle';
    autosaveError = '';
  }

  async function deleteActivity(activityId: string) {
    if (!confirm(t('admin.deleteActivityConfirm', locale))) return;
    await run(() => serverMutate('apiMutation', `/api/activities/${activityId}`, 'DELETE'));
    if (editingId === activityId) cancelEdit();
  }

  function clearDragState() {
    dragModuleId = null;
    dragActivity = null;
    dropTargetModuleId = null;
    dropBeforeActivityId = null;
    dropBeforeModuleId = null;
  }

  async function persistModuleOrder(moduleIds: string[]) {
    await run(async () => {
      await Promise.all(
        moduleIds.map((id, index) =>
          serverMutate('apiMutation', `/api/modules/${id}`, 'PATCH', { sortOrder: index }),
        ),
      );
    });
  }

  async function persistActivities(moduleId: string, activityIds: string[]) {
    await run(async () => {
      await Promise.all(
        activityIds.map((id, index) =>
          serverMutate('apiMutation', `/api/activities/${id}`, 'PATCH', { moduleId, sortOrder: index }),
        ),
      );
    });
  }

  async function handleModuleDrop(targetModuleId: string) {
    const draggedModuleId = dragModuleId;
    if (!draggedModuleId || draggedModuleId === targetModuleId) return;
    const ids = orderedModules.map((mod) => mod.id);
    const from = ids.indexOf(draggedModuleId);
    const to = ids.indexOf(targetModuleId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    clearDragState();
    await persistModuleOrder(next);
  }

  async function handleActivityDrop(targetModuleId: string, beforeActivityId: string | null) {
    if (!dragActivity) return;
    const sourceModule = orderedModules.find((mod) => mod.id === dragActivity!.moduleId);
    const targetModule = orderedModules.find((mod) => mod.id === targetModuleId);
    if (!sourceModule || !targetModule) return;

    const dragged = sourceModule.activities.find((activity) => activity.id === dragActivity!.id);
    if (!dragged) return;

    if (moduleHasTextActivity(targetModule) && !isTextType(dragged.type)) {
      clearDragState();
      error = t('admin.textFieldBlocksAddHint', locale);
      return;
    }
    if (isTextType(dragged.type) && (moduleHasTextActivity(targetModule) || moduleHasNonTextActivities(targetModule))) {
      clearDragState();
      error = t('admin.textFieldModuleConflict', locale);
      return;
    }

    const sourceIds = sourceModule.activities.map((a) => a.id).filter((id) => id !== dragActivity!.id);
    let targetIds = targetModule.activities.map((a) => a.id).filter((id) => id !== dragActivity!.id);

    const insertAt =
      beforeActivityId === null
        ? targetIds.length
        : Math.max(0, targetIds.indexOf(beforeActivityId));

    targetIds.splice(insertAt, 0, dragActivity.id);
    clearDragState();
    await run(async () => {
      await Promise.all(
        targetIds.map((id, index) =>
          serverMutate('apiMutation', `/api/activities/${id}`, 'PATCH', { moduleId: targetModuleId, sortOrder: index }),
        ),
      );
      if (sourceModule.id !== targetModuleId) {
        await Promise.all(
          sourceIds.map((id, index) =>
            serverMutate('apiMutation', `/api/activities/${id}`, 'PATCH', { moduleId: sourceModule.id, sortOrder: index }),
          ),
        );
      }
    });
  }
</script>

<div class="activity-editor">
  {#if error}
    <div class="admin-flash admin-flash--err">{error}</div>
  {/if}

  <p class="course-edit-hint">{t('admin.activitiesHint', locale)}</p>
  <p class="course-edit-hint activity-editor-dnd-hint">{t('admin.dragToReorder', locale)}</p>
  <div class="activity-editor-toolbar">
    <AutosaveStatus status={autosaveStatus} error={autosaveError} />
  </div>

  {#if modules.length === 0}
    <div class="activity-editor-empty">
      <p>{t('admin.noModules', locale)}</p>
      {#if addingModule}
        <div class="activity-editor-add-form">
          <input
            type="text"
            placeholder={t('admin.moduleTitlePlaceholder', locale)}
            bind:value={newModuleTitle}
            disabled={saving}
          />
          <button type="button" class="btn btn-sm" disabled={saving} onclick={addModule}>
            {t('admin.addModule', locale)}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (addingModule = false)}>
            {t('admin.cancel', locale)}
          </button>
        </div>
      {:else}
        <button type="button" class="btn btn-sm" disabled={saving} onclick={() => (addingModule = true)}>
          {t('admin.addModule', locale)}
        </button>
      {/if}
    </div>
  {:else}
    {#each orderedModules as mod (mod.id)}
      <div
        class="module-drop-slot"
        class:module-drop-slot--active={isDraggingModule() && dropBeforeModuleId === mod.id}
        ondragover={(e) => {
          if (!allowDrop(e) || !isDraggingModule()) return;
          dropBeforeModuleId = mod.id;
        }}
        ondrop={(e) => {
          e.preventDefault();
          if (isDraggingModule()) void handleModuleDrop(mod.id);
        }}
      ></div>
      <article
        class="activity-module-card"
        class:activity-module-card--drop={
          isDraggingModule()
            ? dropBeforeModuleId === mod.id
            : dropTargetModuleId === mod.id && isDraggingActivity() && canAcceptActivityDrop(mod)
        }
        ondragover={(e) => {
          if (!allowDrop(e)) return;
          if (isDraggingActivity() && canAcceptActivityDrop(mod)) dropTargetModuleId = mod.id;
          if (isDraggingModule()) dropBeforeModuleId = mod.id;
        }}
        ondrop={(e) => {
          e.preventDefault();
          if (isDraggingModule()) void handleModuleDrop(mod.id);
          else if (isDraggingActivity() && canAcceptActivityDrop(mod)) {
            void handleActivityDrop(mod.id, dropBeforeActivityId);
          }
        }}
      >
        <header class="activity-module-header">
          <span
            class="activity-drag-handle"
            aria-hidden="true"
            draggable={!saving}
            ondragstart={(e) => startModuleDrag(e, mod.id)}
            ondragend={clearDragState}
          >⋮⋮</span>
          <input
            class="activity-module-title"
            value={mod.title}
            disabled={saving}
            oninput={(e) => queueModuleTitleSave(mod.id, (e.currentTarget as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm activity-module-delete"
            disabled={saving}
            onclick={() => deleteModule(mod.id)}
          >
            {t('admin.deleteModule', locale)}
          </button>
        </header>

        <ul class="activity-list">
          {#each mod.activities as activity (activity.id)}
            <li
              class="activity-row"
              class:activity-row--editing={editingId === activity.id}
              class:activity-row--drop-before={dropBeforeActivityId === activity.id && isDraggingActivity()}
              draggable={!saving && editingId !== activity.id}
              ondragstart={(e) => startActivityDrag(e, activity.id, mod.id)}
              ondragend={clearDragState}
              ondragover={(e) => {
                if (!allowDrop(e) || !isDraggingActivity() || !canAcceptActivityDrop(mod)) return;
                dropTargetModuleId = mod.id;
                dropBeforeActivityId = activity.id;
              }}
              ondrop={(e) => {
                e.preventDefault();
                if (isDraggingActivity() && canAcceptActivityDrop(mod)) {
                  e.stopPropagation();
                  void handleActivityDrop(mod.id, activity.id);
                }
              }}
            >
              <div class="activity-row-main">
                <span class="activity-drag-handle" aria-hidden="true">⋮⋮</span>
                <span class="activity-type-badge">{activityLabel(activity.type)}</span>
                {#if editingId === activity.id}
                  {#if !isTextType(activity.type)}
                    <input class="activity-title-input" bind:value={editTitle} disabled={saving} />
                  {/if}
                {:else if isTextType(activity.type)}
                  <div class="activity-title-block activity-title-block--text">
                    <span class="activity-description-preview">{textPreview(activity.content)}</span>
                  </div>
                {:else}
                  <div class="activity-title-block">
                    <span class="activity-title">{activity.title}</span>
                    {#if isVideoType(activity.type)}
                      <span class="activity-video-source">{videoSourceSummary(activity.config)}</span>
                    {/if}
                    {#if isPresentationType(activity.type)}
                      <span class="activity-video-source">{presentationSourceSummary(activity.config)}</span>
                    {/if}
                    {#if activity.content}
                      <span class="activity-description-preview">{activity.content}</span>
                    {/if}
                  </div>
                {/if}
                <div class="activity-row-actions">
                  {#if editingId === activity.id}
                    <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={cancelEdit}>
                      {t('admin.cancel', locale)}
                    </button>
                  {:else}
                    <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => startEdit(activity)}>
                      {t('admin.edit', locale)}
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => deleteActivity(activity.id)}>
                      {t('admin.delete', locale)}
                    </button>
                  {/if}
                </div>
              </div>

              {#if editingId === activity.id}
                <div class="activity-edit-fields">
                  <label>
                    <span>{contentFieldLabel(activity.type)}</span>
                    <textarea class="activity-description-input" rows="4" bind:value={editContent} disabled={saving}></textarea>
                  </label>
                  {#if isVideoType(activity.type)}
                    <VideoActivityFields courseId={courseId} {locale} disabled={saving} bind:form={editVideoForm} />
                  {:else if isPresentationType(activity.type)}
                    <PresentationActivityFields courseId={courseId} {locale} disabled={saving} bind:form={editPresentationForm} />
                  {:else if isScormType(activity.type)}
                    <ScormActivityFields courseId={courseId} {locale} disabled={saving} bind:form={editScormForm} />
                  {:else if showUrlField(activity.type)}
                    <label>
                      <span>{t('admin.activityMediaUrl', locale)}</span>
                      <input type="url" bind:value={editConfigUrl} disabled={saving} placeholder="https://..." />
                    </label>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>

        {#if canAcceptActivityDrop(mod)}
          <div
            class="activity-module-dropzone"
            class:activity-module-dropzone--active={
              dropTargetModuleId === mod.id && isDraggingActivity() && dropBeforeActivityId === null
            }
            ondragover={(e) => {
              if (!allowDrop(e) || !isDraggingActivity()) return;
              dropTargetModuleId = mod.id;
              dropBeforeActivityId = null;
            }}
            ondrop={(e) => {
              e.preventDefault();
              if (isDraggingActivity()) {
                e.stopPropagation();
                void handleActivityDrop(mod.id, null);
              }
            }}
          >
            {t('admin.dropActivityHere', locale)}
          </div>
        {/if}

        {#if addingToModule === mod.id && canAddActivity(mod)}
          <div
            class="activity-editor-add-form"
            class:activity-editor-add-form--media={
              isVideoType(newActivityType) || isPresentationType(newActivityType) || isScormType(newActivityType)
            }
          >
            <div class="activity-editor-add-form-body">
              <select bind:value={newActivityType} disabled={saving}>
                {#each allowedActivityTypes(mod) as type}
                  <option value={type}>{t(`activity.type.${type}`, locale)}</option>
                {/each}
              </select>
              {#if isTextType(newActivityType)}
                <textarea
                  class="activity-description-input"
                  rows="4"
                  placeholder={t('admin.textFieldContentPlaceholder', locale)}
                  bind:value={newActivityDescription}
                  disabled={saving}
                ></textarea>
              {:else}
                <input
                  type="text"
                  placeholder={t('admin.activityTitlePlaceholder', locale)}
                  bind:value={newActivityTitle}
                  oninput={() => {
                    if (error) error = '';
                  }}
                  disabled={saving}
                />
                <textarea
                  class="activity-description-input"
                  rows="3"
                  placeholder={t('admin.activityDescriptionPlaceholder', locale)}
                  bind:value={newActivityDescription}
                  disabled={saving}
                ></textarea>
                {#if isVideoType(newActivityType)}
                  <VideoActivityFields courseId={courseId} {locale} disabled={saving} bind:form={newVideoForm} />
                {:else if isPresentationType(newActivityType)}
                  <PresentationActivityFields
                    courseId={courseId}
                    {locale}
                    disabled={saving}
                    bind:form={newPresentationForm}
                  />
                {:else if isScormType(newActivityType)}
                  <ScormActivityFields courseId={courseId} {locale} disabled={saving} bind:form={newScormForm} />
                {/if}
              {/if}
            </div>
            <div class="activity-editor-add-form-actions">
              <button
                type="button"
                class="btn btn-sm"
                disabled={saving}
                onclick={() => addActivity(mod.id)}
              >
                {t('admin.addActivity', locale)}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (addingToModule = null)}>
                {t('admin.cancel', locale)}
              </button>
            </div>
          </div>
        {:else if canAddActivity(mod)}
          <button type="button" class="btn btn-ghost btn-sm activity-add-btn" disabled={saving} onclick={() => startAddActivity(mod)}>
            + {t('admin.addActivity', locale)}
          </button>
        {:else}
          <p class="activity-editor-locked-hint">{t('admin.textFieldBlocksAddHint', locale)}</p>
        {/if}
      </article>
    {/each}
    {#if modules.length > 0}
      <div
        class="module-drop-slot module-drop-slot--end"
        class:module-drop-slot--active={isDraggingModule() && dropBeforeModuleId === '__end__'}
        ondragover={(e) => {
          if (!allowDrop(e) || !isDraggingModule()) return;
          dropBeforeModuleId = '__end__';
        }}
        ondrop={(e) => {
          e.preventDefault();
          const draggedModuleId = dragModuleId;
          if (!draggedModuleId) return;
          const ids = orderedModules.map((m) => m.id).filter((id) => id !== draggedModuleId);
          ids.push(draggedModuleId);
          clearDragState();
          void persistModuleOrder(ids);
        }}
      ></div>
    {/if}
  {/if}

  {#if modules.length > 0}
    <footer class="activity-editor-footer">
      {#if addingModule}
        <div class="activity-editor-add-form">
          <input
            type="text"
            placeholder={t('admin.moduleTitlePlaceholder', locale)}
            bind:value={newModuleTitle}
            disabled={saving}
          />
          <button type="button" class="btn btn-sm" disabled={saving} onclick={addModule}>
            {t('admin.addModule', locale)}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (addingModule = false)}>
            {t('admin.cancel', locale)}
          </button>
        </div>
      {:else}
        <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (addingModule = true)}>
          + {t('admin.addModule', locale)}
        </button>
      {/if}
    </footer>
  {/if}
</div>

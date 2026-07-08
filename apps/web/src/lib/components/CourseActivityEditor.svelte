<script lang="ts">
  import { ACTIVITY_TYPES } from '@youniversity2/shared';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { normalizeActivityType } from '$lib/activity-types';
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
  let dragModuleId = $state<string | null>(null);
  let dragActivity = $state<{ id: string; moduleId: string } | null>(null);
  let dropTargetModuleId = $state<string | null>(null);
  let dropBeforeActivityId = $state<string | null>(null);
  let dropBeforeModuleId = $state<string | null>(null);

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
      await api.createCourseModule(courseId, { title });
      newModuleTitle = '';
      addingModule = false;
    });
  }

  async function deleteModule(moduleId: string) {
    if (!confirm(t('admin.deleteModuleConfirm', locale))) return;
    await run(() => api.deleteCourseModule(moduleId));
  }

  async function saveModuleTitle(moduleId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    await run(() => api.updateCourseModule(moduleId, { title: trimmed }));
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
  }

  async function addActivity(moduleId: string) {
    const content = newActivityDescription.trim();
    if (isTextType(newActivityType)) {
      await run(async () => {
        await api.createActivity(moduleId, {
          type: 'text',
          content: content || undefined,
        });
        addingToModule = null;
        newActivityDescription = '';
      });
      return;
    }

    const title = newActivityTitle.trim();
    if (!title) return;
    await run(async () => {
      await api.createActivity(moduleId, {
        type: newActivityType,
        title,
        content: content || undefined,
      });
      addingToModule = null;
      newActivityTitle = '';
      newActivityDescription = '';
    });
  }

  function startEdit(activity: ActivityRow) {
    editingId = activity.id;
    editTitle = activity.title;
    editContent = activity.content ?? '';
    const cfg = activity.config ?? {};
    editConfigUrl =
      (cfg.embedUrl as string) ||
      (cfg.videoUrl as string) ||
      (cfg.audioUrl as string) ||
      (cfg.presentationUrl as string) ||
      '';
  }

  function configForType(type: string, url: string): Record<string, unknown> | undefined {
    const normalized = normalizeActivityType(type);
    if (!url.trim()) return undefined;
    if (normalized === 'video') return { embedUrl: url.trim() };
    if (normalized === 'audio') return { audioUrl: url.trim() };
    if (normalized === 'presentation') return { presentationUrl: url.trim() };
    return undefined;
  }

  function showUrlField(type: string) {
    const normalized = normalizeActivityType(type);
    return normalized === 'video' || normalized === 'audio' || normalized === 'presentation';
  }

  async function saveActivity(activity: ActivityRow) {
    const normalized = normalizeActivityType(activity.type);
    const config = configForType(activity.type, editConfigUrl);

    if (isTextType(activity.type)) {
      await run(() =>
        api.updateActivity(activity.id, {
          content: editContent,
          config,
        }),
      );
      editingId = null;
      return;
    }

    const title = editTitle.trim();
    if (!title) return;
    await run(() =>
      api.updateActivity(activity.id, {
        title,
        content: editContent,
        config,
        type: ACTIVITY_TYPES.includes(normalized as (typeof ACTIVITY_TYPES)[number])
          ? (normalized as (typeof ACTIVITY_TYPES)[number])
          : undefined,
      }),
    );
    editingId = null;
  }

  async function deleteActivity(activityId: string) {
    if (!confirm(t('admin.deleteActivityConfirm', locale))) return;
    await run(() => api.deleteActivity(activityId));
    if (editingId === activityId) editingId = null;
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
      await Promise.all(moduleIds.map((id, index) => api.updateCourseModule(id, { sortOrder: index })));
    });
  }

  async function persistActivities(moduleId: string, activityIds: string[]) {
    await run(async () => {
      await Promise.all(
        activityIds.map((id, index) => api.updateActivity(id, { moduleId, sortOrder: index })),
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
        targetIds.map((id, index) => api.updateActivity(id, { moduleId: targetModuleId, sortOrder: index })),
      );
      if (sourceModule.id !== targetModuleId) {
        await Promise.all(
          sourceIds.map((id, index) => api.updateActivity(id, { moduleId: sourceModule.id, sortOrder: index })),
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
            onchange={(e) => saveModuleTitle(mod.id, (e.currentTarget as HTMLInputElement).value)}
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
                    {#if activity.content}
                      <span class="activity-description-preview">{activity.content}</span>
                    {/if}
                  </div>
                {/if}
                <div class="activity-row-actions">
                  {#if editingId === activity.id}
                    <button type="button" class="btn btn-sm" disabled={saving} onclick={() => saveActivity(activity)}>
                      {t('admin.saveChanges', locale)}
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (editingId = null)}>
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
                  {#if showUrlField(activity.type)}
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
          <div class="activity-editor-add-form">
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
                disabled={saving}
              />
              <textarea
                class="activity-description-input"
                rows="3"
                placeholder={t('admin.activityDescriptionPlaceholder', locale)}
                bind:value={newActivityDescription}
                disabled={saving}
              ></textarea>
            {/if}
            <button type="button" class="btn btn-sm" disabled={saving} onclick={() => addActivity(mod.id)}>
              {t('admin.addActivity', locale)}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => (addingToModule = null)}>
              {t('admin.cancel', locale)}
            </button>
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

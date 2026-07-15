<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { queryApi, mutateApi } from '$lib/client/form-action';

  type ContentBankUsage = {
    courseId: string;
    courseTitle: string;
    moduleId: string;
    moduleTitle: string;
    activityId: string;
    activityTitle: string;
    activityType: string;
  };

  type ContentBankItem = {
    id: string;
    kind: 'video' | 'presentation' | 'scorm';
    displayName: string;
    fileName?: string;
    sizeBytes: number;
    uploadedAt?: string;
    usages: ContentBankUsage[];
    orphan: boolean;
  };

  let query = $state('');
  let kindFilter = $state<'all' | 'video' | 'presentation' | 'scorm'>('all');
  let items = $state<ContentBankItem[]>([]);
  let totalBytes = $state(0);
  let loading = $state(false);
  let error = $state('');
  let message = $state('');
  let renameItem = $state<ContentBankItem | null>(null);
  let renameValue = $state('');
  let savingRename = $state(false);

  const filteredItems = $derived(
    items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const haystack = [
        item.displayName,
        item.fileName ?? '',
        item.kind,
        ...item.usages.map((u) => `${u.courseTitle} ${u.moduleTitle} ${u.activityTitle}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    }),
  );

  function formatBytes(bytes: number) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatDateTime(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function kindLabel(kind: ContentBankItem['kind']) {
    const key = `admin.contentBank.kind.${kind}` as Parameters<typeof t>[0];
    return t(key, $locale);
  }

  function courseActivityHref(usage: ContentBankUsage) {
    const sp = new URLSearchParams({ activity: usage.activityId });
    return `/dashboard/admin/manage/courses/${usage.courseId}?${sp}`;
  }

  async function loadItems() {
    loading = true;
    error = '';
    message = '';
    try {
      const sp = new URLSearchParams({ locale: $locale });
      if (query.trim()) sp.set('q', query.trim());
      const result = await queryApi<{
        items: ContentBankItem[];
        totalBytes: number;
        totalCount: number;
      }>('apiQuery', `/api/admin/content-bank?${sp}`);
      if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
      items = result.data.items;
      totalBytes = result.data.totalBytes;
    } catch (e) {
      error = (e as Error).message;
      items = [];
      totalBytes = 0;
    } finally {
      loading = false;
    }
  }

  function openRename(item: ContentBankItem) {
    renameItem = item;
    renameValue = item.displayName;
  }

  function closeRename() {
    renameItem = null;
    renameValue = '';
  }

  async function saveRename() {
    if (!renameItem || !renameValue.trim()) return;
    savingRename = true;
    error = '';
    try {
      const path = `/api/admin/content-bank/${encodeURIComponent(renameItem.id)}`;
      const result = await mutateApi('apiMutation', path, 'PATCH', {
        displayName: renameValue.trim(),
        locale: $locale,
      });
      if (!result.ok) throw new Error(result.error ?? t('error.unknown', $locale));
      message = t('admin.contentBank.renameSuccess', $locale);
      closeRename();
      await loadItems();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      savingRename = false;
    }
  }

  async function unlinkUsage(item: ContentBankItem, usage: ContentBankUsage) {
    if (!confirm(t('admin.contentBank.unlinkConfirm', $locale))) return;
    error = '';
    try {
      const path = `/api/admin/content-bank/${encodeURIComponent(item.id)}/unlink`;
      const result = await mutateApi('apiMutation', path, 'POST', { activityId: usage.activityId });
      if (!result.ok) throw new Error(result.error ?? t('error.unknown', $locale));
      message = t('admin.contentBank.unlinkSuccess', $locale);
      await loadItems();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function purgeItem(item: ContentBankItem) {
    if (!confirm(t('admin.contentBank.purgeConfirm', $locale))) return;
    error = '';
    try {
      const path = `/api/admin/content-bank/${encodeURIComponent(item.id)}?locale=${$locale}`;
      const result = await mutateApi('apiMutation', path, 'DELETE');
      if (!result.ok) throw new Error(result.error ?? t('error.unknown', $locale));
      message = t('admin.contentBank.purgeSuccess', $locale);
      await loadItems();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(() => {
    void loadItems();
  });
</script>

<div class="content-bank">
  <header class="content-bank-hero admin-manage-header">
    <div>
      <h1>{t('admin.settingsContentBankTitle', $locale)}</h1>
      <p>{t('admin.settingsContentBankSub', $locale)}</p>
    </div>
    <div class="content-bank-stats">
      <article class="content-bank-stat">
        <p class="content-bank-stat-label">{t('admin.contentBank.statFiles', $locale)}</p>
        <p class="content-bank-stat-value">{items.length}</p>
      </article>
      <article class="content-bank-stat">
        <p class="content-bank-stat-label">{t('admin.contentBank.statStorage', $locale)}</p>
        <p class="content-bank-stat-value">{formatBytes(totalBytes)}</p>
      </article>
      <article class="content-bank-stat">
        <p class="content-bank-stat-label">{t('admin.contentBank.statOrphans', $locale)}</p>
        <p class="content-bank-stat-value">{items.filter((i) => i.orphan).length}</p>
      </article>
    </div>
  </header>

  <div class="content-bank-toolbar">
    <input
      type="search"
      placeholder={t('admin.contentBank.searchPlaceholder', $locale)}
      bind:value={query}
      oninput={() => void loadItems()}
    />
    <select bind:value={kindFilter} aria-label={t('admin.contentBank.kindFilter', $locale)}>
      <option value="all">{t('admin.contentBank.kindAll', $locale)}</option>
      <option value="video">{t('admin.contentBank.kind.video', $locale)}</option>
      <option value="presentation">{t('admin.contentBank.kind.presentation', $locale)}</option>
      <option value="scorm">{t('admin.contentBank.kind.scorm', $locale)}</option>
    </select>
    <button type="button" class="btn btn-sm" disabled={loading} onclick={() => loadItems()}>
      {t('admin.reports.refresh', $locale)}
    </button>
  </div>

  {#if error}
    <div class="admin-flash admin-flash--err">{error}</div>
  {/if}
  {#if message}
    <div class="admin-flash admin-flash--ok">{message}</div>
  {/if}

  {#if loading}
    <p class="content-bank-empty">{t('admin.contentBank.loading', $locale)}</p>
  {:else if filteredItems.length === 0}
    <p class="content-bank-empty">{t('admin.contentBank.empty', $locale)}</p>
  {:else}
    <div class="content-bank-list">
      {#each filteredItems as item (item.id)}
        <article class="content-bank-card" class:content-bank-card--orphan={item.orphan}>
          <div class="content-bank-card-header">
            <div>
              <div style="display:flex;gap:0.45rem;align-items:center;flex-wrap:wrap;">
                <span class="content-bank-kind content-bank-kind--{item.kind}">{kindLabel(item.kind)}</span>
                {#if item.orphan}
                  <span class="admin-reporting-badge admin-reporting-badge--degraded">
                    {t('admin.contentBank.orphanBadge', $locale)}
                  </span>
                {/if}
              </div>
              <h2 class="content-bank-card-title">{item.displayName}</h2>
              <p class="content-bank-card-meta">
                {formatBytes(item.sizeBytes)} · {t('admin.contentBank.uploaded', $locale)} {formatDateTime(item.uploadedAt)}
              </p>
            </div>
            <div class="content-bank-card-actions">
              <button type="button" class="btn btn-ghost btn-sm" onclick={() => openRename(item)}>
                {t('admin.contentBank.rename', $locale)}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" onclick={() => purgeItem(item)}>
                {t('admin.contentBank.purge', $locale)}
              </button>
            </div>
          </div>

          <div class="content-bank-usages">
            <p class="content-bank-usages-title">
              {t('admin.contentBank.usagesTitle', $locale)} ({item.usages.length})
            </p>
            {#if item.usages.length === 0}
              <p class="content-bank-card-meta">{t('admin.contentBank.noUsages', $locale)}</p>
            {:else}
              <div class="content-bank-usage-list">
                {#each item.usages as usage (`${usage.activityId}-${item.id}`)}
                  <div class="content-bank-usage-row">
                    <p class="content-bank-usage-path">
                      <strong>{usage.courseTitle}</strong>
                      <span> → </span>
                      {usage.moduleTitle}
                      <span> → </span>
                      {usage.activityTitle}
                    </p>
                    <div class="content-bank-usage-actions">
                      <a href={courseActivityHref(usage)} class="btn btn-ghost btn-sm">
                        {t('admin.contentBank.openInCourse', $locale)}
                      </a>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onclick={() => unlinkUsage(item, usage)}
                      >
                        {t('admin.contentBank.unlink', $locale)}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if renameItem}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="content-bank-backdrop" onclick={(e) => e.target === e.currentTarget && closeRename()} role="presentation">
    <div class="content-bank-modal" role="dialog" aria-modal="true" aria-labelledby="content-bank-rename-title">
      <div class="content-bank-modal-header">
        <h2 id="content-bank-rename-title">{t('admin.contentBank.renameTitle', $locale)}</h2>
        <button type="button" class="content-bank-modal-close" aria-label={t('a11y.close', $locale)} onclick={closeRename}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="content-bank-modal-body">
        <input
          type="text"
          class="content-bank-rename-input"
          bind:value={renameValue}
          maxlength="500"
          aria-label={t('admin.contentBank.renameField', $locale)}
        />
        <div class="content-bank-modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick={closeRename}>
            {t('admin.cancel', $locale)}
          </button>
          <button type="button" class="btn btn-sm" disabled={savingRename || !renameValue.trim()} onclick={() => saveRename()}>
            {t('admin.saveChanges', $locale)}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

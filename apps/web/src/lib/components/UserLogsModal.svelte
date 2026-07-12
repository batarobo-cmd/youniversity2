<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { queryApi } from '$lib/client/form-action';
  import { describeUserLog } from '$lib/user-log-labels';
  import ViewportPaginator from '$lib/components/ViewportPaginator.svelte';

  type ManagedUser = { id: string; name: string; email: string };

  let {
    user = null,
    open = false,
    onClose,
  }: {
    user?: ManagedUser | null;
    open?: boolean;
    onClose: () => void;
  } = $props();

  let query = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');
  let items = $state<Array<Record<string, unknown>>>([]);
  let total = $state(0);
  let retentionFrom = $state('');
  let loading = $state(false);
  let error = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 720);

  const modalListHeight = $derived(Math.max(180, viewportHeight * 0.85 - 260));

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function eventLabel(row: Record<string, unknown>) {
    return describeUserLog(
      {
        eventType: row.eventType as string,
        kind: row.kind as 'login' | 'activity',
        method: row.method as string | undefined,
        courseTitle: row.courseTitle as string | null | undefined,
        payload: row.payload as Record<string, unknown> | undefined,
      },
      $locale,
    );
  }

  async function loadLogs() {
    if (!user) return;
    loading = true;
    error = '';
    try {
      const sp = new URLSearchParams({ locale: $locale, limit: '150' });
      if (query.trim()) sp.set('q', query.trim());
      if (dateFrom) sp.set('from', dateFrom);
      if (dateTo) sp.set('to', dateTo);
      const result = await queryApi<{
        items: Array<Record<string, unknown>>;
        total: number;
        retentionFrom: string;
      }>('apiQuery', `/api/admin/users/${user.id}/logs?${sp}`);
      if (result.error || !result.data) throw new Error(result.error ?? 'Chyba');
      items = result.data.items;
      total = result.data.total;
      retentionFrom = result.data.retentionFrom;
    } catch (e) {
      error = (e as Error).message;
      items = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function scheduleLoad() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void loadLogs(), 250);
  }

  $effect(() => {
    if (open && user) {
      query = '';
      dateFrom = '';
      dateTo = '';
      void loadLogs();
    }
  });

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('admin-history-backdrop')) onClose();
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && open && onClose()}
  onresize={() => {
    viewportHeight = window.innerHeight;
  }}
/>

{#if open && user}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="admin-history-backdrop" onclick={handleBackdrop} role="presentation">
    <div class="admin-history-modal admin-history-modal--wide" role="dialog" aria-modal="true">
      <div class="admin-history-header">
        <div>
          <h2 id="user-logs-title">{t('admin.userLogsTitle', $locale)}</h2>
          <p class="admin-history-sub">{user.name} · {user.email}</p>
          {#if retentionFrom}
            <p class="admin-history-sub">{t('admin.userLogsRetention', $locale)}</p>
          {/if}
        </div>
        <button type="button" class="admin-history-close" aria-label={t('admin.cancel', $locale)} onclick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="admin-history-filters">
        <input
          type="search"
          class="admin-history-input"
          placeholder={t('admin.userLogsSearch', $locale)}
          bind:value={query}
          oninput={scheduleLoad}
        />
        <input type="date" class="admin-history-input admin-history-date" bind:value={dateFrom} onchange={scheduleLoad} />
        <input type="date" class="admin-history-input admin-history-date" bind:value={dateTo} onchange={scheduleLoad} />
        <button type="button" class="btn btn-sm" onclick={() => void loadLogs()} disabled={loading}>
          {t('dash.historyFilter', $locale)}
        </button>
      </div>

      {#if error}
        <p class="admin-history-error">{error}</p>
      {/if}

      <div class="admin-history-body">
        {#if loading}
          <p class="admin-history-empty">{t('admin.searching', $locale)}</p>
        {:else if items.length === 0}
          <p class="admin-history-empty">{t('admin.userLogsEmpty', $locale)}</p>
        {:else}
          <p class="admin-history-count">{total} {t('admin.userLogsEntries', $locale)}</p>
          <ViewportPaginator
            items={items}
            resetKey="{query}|{dateFrom}|{dateTo}"
            availableHeight={modalListHeight}
            rowHeight={48}
            minPageSize={4}
          >
            {#snippet children(pageItems)}
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.userLogsWhen', $locale)}</th>
                    <th>{t('admin.userLogsAction', $locale)}</th>
                    <th>{t('dash.courseName', $locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each pageItems as row}
                    <tr>
                      <td>{formatDateTime(row.occurredAt as string)}</td>
                      <td>{eventLabel(row)}</td>
                      <td>{(row.courseTitle as string) || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/snippet}
          </ViewportPaginator>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-history-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
  }

  .admin-history-modal {
    width: min(920px, 100%);
    max-height: min(85vh, 720px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .admin-history-modal--wide {
    width: min(960px, 100%);
  }

  .admin-history-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .admin-history-header h2 {
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .admin-history-sub {
    font-size: 0.8125rem;
    color: var(--color-muted);
    margin-top: 0.25rem;
  }

  .admin-history-close {
    display: inline-flex;
    padding: 0.375rem;
    border: none;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .admin-history-close:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .admin-history-close svg {
    width: 18px;
    height: 18px;
  }

  .admin-history-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .admin-history-input {
    flex: 1;
    min-width: 180px;
    font-size: 0.875rem;
  }

  .admin-history-date {
    flex: 0 0 auto;
    min-width: 140px;
  }

  .admin-history-body {
    overflow: visible;
    padding: 0 0 0.75rem;
  }

  .admin-history-count {
    padding: 0.75rem 1.25rem 0;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .admin-history-empty,
  .admin-history-error {
    padding: 2rem 1.25rem;
    text-align: center;
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .admin-history-error {
    color: var(--color-danger);
    padding-bottom: 0;
  }
</style>

<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { queryApi } from '$lib/client/form-action';
  import ViewportPaginator from '$lib/components/ViewportPaginator.svelte';

  type HistoryKind = 'registrations' | 'logins';

  let {
    kind,
    open = false,
    onClose,
  }: {
    kind: HistoryKind;
    open?: boolean;
    onClose: () => void;
  } = $props();

  let query = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');
  let items = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(false);
  let error = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 720);

  const modalListHeight = $derived(Math.max(180, viewportHeight * 0.85 - 230));

  const title = $derived(
    kind === 'registrations' ? t('dash.registrationHistory', $locale) : t('dash.loginHistory', $locale),
  );

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function loginMethodLabel(method: string) {
    const keys: Record<string, 'dash.loginMethodPassword' | 'dash.loginMethodGoogle' | 'dash.loginMethodMicrosoft'> = {
      password: 'dash.loginMethodPassword',
      oauth_google: 'dash.loginMethodGoogle',
      oauth_microsoft: 'dash.loginMethodMicrosoft',
    };
    const key = keys[method];
    return key ? t(key, $locale) : method;
  }

  async function loadHistory() {
    loading = true;
    error = '';
    try {
      const sp = new URLSearchParams({ limit: '100', offset: '0' });
      if (query.trim()) sp.set('q', query.trim());
      if (dateFrom) sp.set('from', dateFrom);
      if (dateTo) sp.set('to', dateTo);
      const path =
        kind === 'registrations'
          ? `/api/admin/registrations/history?${sp}`
          : `/api/admin/logins/history?${sp}`;
      const result = await queryApi<{ items: Array<Record<string, unknown>> }>('apiQuery', path);
      if (result.error || !result.data) throw new Error(result.error ?? 'Chyba');
      items = result.data.items;
    } catch (e) {
      error = (e as Error).message;
      items = [];
    } finally {
      loading = false;
    }
  }

  function scheduleLoad() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void loadHistory(), 250);
  }

  $effect(() => {
    if (open) {
      query = '';
      dateFrom = '';
      dateTo = '';
      void loadHistory();
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

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="admin-history-backdrop" onclick={handleBackdrop} role="presentation">
    <div class="admin-history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="admin-history-header">
        <h2 id="history-title">{title}</h2>
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
          placeholder={t('dash.historySearchPlaceholder', $locale)}
          bind:value={query}
          oninput={scheduleLoad}
        />
        <input type="date" class="admin-history-input admin-history-date" bind:value={dateFrom} onchange={scheduleLoad} />
        <input type="date" class="admin-history-input admin-history-date" bind:value={dateTo} onchange={scheduleLoad} />
        <button type="button" class="btn btn-sm" onclick={() => void loadHistory()} disabled={loading}>
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
          <p class="admin-history-empty">{t('dash.historyNoResults', $locale)}</p>
        {:else if kind === 'registrations'}
          <ViewportPaginator
            items={items}
            availableHeight={modalListHeight}
            rowHeight={44}
            minPageSize={4}
          >
            {#snippet children(pageItems)}
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>{t('auth.name', $locale)}</th>
                    <th>{t('auth.email', $locale)}</th>
                    <th>{t('dash.registeredAt', $locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each pageItems as row}
                    <tr>
                      <td>{row.userName as string}</td>
                      <td>{row.userEmail as string}</td>
                      <td>{formatDateTime(row.registeredAt as string)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/snippet}
          </ViewportPaginator>
        {:else}
          <ViewportPaginator
            items={items}
            availableHeight={modalListHeight}
            rowHeight={44}
            minPageSize={4}
          >
            {#snippet children(pageItems)}
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>{t('auth.name', $locale)}</th>
                    <th>{t('auth.email', $locale)}</th>
                    <th>{t('dash.loggedInAt', $locale)}</th>
                    <th>{t('dash.loginMethod', $locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each pageItems as row}
                    <tr>
                      <td>{row.userName as string}</td>
                      <td>{row.userEmail as string}</td>
                      <td>{formatDateTime(row.loggedInAt as string)}</td>
                      <td>{loginMethodLabel(row.method as string)}</td>
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

  .admin-history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .admin-history-header h2 {
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .admin-history-close {
    display: inline-flex;
    padding: 0.375rem;
    border: none;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
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

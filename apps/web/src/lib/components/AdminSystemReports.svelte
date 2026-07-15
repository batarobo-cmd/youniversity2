<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { token, locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { queryApi } from '$lib/client/form-action';
  import { api } from '$lib/api';
  import { describeUserLog } from '$lib/user-log-labels';
  import ViewportPaginator from '$lib/components/ViewportPaginator.svelte';
  import type { Locale } from '@youniversity2/shared';

  type Tab = 'overview' | 'audit' | 'auth' | 'health' | 'errors' | 'users';

  type ManagedUser = { id: string; name: string; email: string; role?: string };

  let activeTab = $state<Tab>('overview');
  let query = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');
  let loading = $state(false);
  let logsLoading = $state(false);
  let error = $state('');

  let overview = $state<Record<string, unknown> | null>(null);
  let auditItems = $state<Array<Record<string, unknown>>>([]);
  let authItems = $state<Array<Record<string, unknown>>>([]);
  let health = $state<Record<string, unknown> | null>(null);
  let errorAggregates = $state<Array<Record<string, unknown>>>([]);
  let errorRecent = $state<Array<Record<string, unknown>>>([]);
  let mediaItems = $state<Array<Record<string, unknown>>>([]);
  let retentionFrom = $state('');

  let allUsers = $state<ManagedUser[]>([]);
  let usersLoading = $state(false);
  let userSearch = $state('');
  let selectedUserId = $state('');
  let userLogItems = $state<Array<Record<string, unknown>>>([]);
  let userLogTotal = $state(0);

  function queryParams() {
    const sp = new URLSearchParams({ limit: '100', offset: '0' });
    if (query.trim()) sp.set('q', query.trim());
    if (dateFrom) sp.set('from', dateFrom);
    if (dateTo) sp.set('to', dateTo);
    return sp.toString();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function healthBadgeClass(status: string) {
    if (status === 'ok' || status === 'success') return 'admin-reporting-badge--ok';
    if (status === 'not_configured' || status === 'degraded') return 'admin-reporting-badge--degraded';
    return 'admin-reporting-badge--error';
  }

  function authBadgeClass(kind: string) {
    return kind === 'success' ? 'admin-reporting-badge--success' : 'admin-reporting-badge--failure';
  }

  function describeAuditRow(row: Record<string, unknown>) {
    return describeUserLog(
      {
        eventType: String(row.eventType ?? ''),
        kind: 'activity',
        payload: (row.payload as Record<string, unknown>) ?? {},
      },
      $locale,
    );
  }

  function authEventLabel(eventType: string) {
    const key = `admin.reports.authEvent.${eventType}` as Parameters<typeof t>[0];
    const translated = t(key, $locale);
    return translated !== key ? translated : eventType;
  }

  function healthLabel(check: string) {
    const key = `admin.reports.health.${check}` as Parameters<typeof t>[0];
    const translated = t(key, $locale);
    return translated !== key ? translated : check;
  }

  async function loadOverview() {
    const result = await queryApi<Record<string, unknown>>('apiQuery', '/api/admin/reports/overview');
    if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
    overview = result.data;
    retentionFrom = String(result.data.retentionFrom ?? '');
  }

  async function loadAudit() {
    const result = await queryApi<{ items: Array<Record<string, unknown>>; retentionFrom?: string }>(
      'apiQuery',
      `/api/admin/reports/audit?${queryParams()}`,
    );
    if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
    auditItems = result.data.items;
    retentionFrom = result.data.retentionFrom ?? retentionFrom;
  }

  async function loadAuth() {
    const result = await queryApi<{ items: Array<Record<string, unknown>>; retentionFrom?: string }>(
      'apiQuery',
      `/api/admin/reports/auth?${queryParams()}`,
    );
    if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
    authItems = result.data.items;
    retentionFrom = result.data.retentionFrom ?? retentionFrom;
  }

  async function loadHealth() {
    const result = await queryApi<Record<string, unknown>>('apiQuery', '/api/admin/reports/health');
    if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
    health = result.data;
  }

  async function loadErrors() {
    const result = await queryApi<{
      aggregates: Array<Record<string, unknown>>;
      recent: Array<Record<string, unknown>>;
      retentionFrom?: string;
    }>('apiQuery', `/api/admin/reports/errors?${queryParams()}`);
    if (result.error || !result.data) throw new Error(result.error ?? t('error.unknown', $locale));
    errorAggregates = result.data.aggregates;
    errorRecent = result.data.recent;
    retentionFrom = result.data.retentionFrom ?? retentionFrom;
  }

  async function loadMedia() {
    const result = await queryApi<{ items: Array<Record<string, unknown>> }>(
      'apiQuery',
      `/api/admin/reports/media?${queryParams()}`,
    );
    if (result.error || !result.data) return;
    mediaItems = result.data.items;
  }

  async function loadUsers() {
    usersLoading = true;
    try {
      const users = await api.getUsers();
      allUsers = Array.isArray(users)
        ? users.map((u) => ({
            id: String(u.id),
            name: String(u.name ?? ''),
            email: String(u.email ?? ''),
            role: u.role as string | undefined,
          }))
        : [];
      if (!selectedUserId && allUsers.length > 0) {
        selectedUserId = allUsers[0].id;
      } else if (selectedUserId && !allUsers.some((u) => u.id === selectedUserId) && allUsers.length > 0) {
        selectedUserId = allUsers[0].id;
      }
    } finally {
      usersLoading = false;
    }
  }

  async function loadUserLogs() {
    const userId = selectedUserId;
    if (!userId) {
      userLogItems = [];
      userLogTotal = 0;
      logsLoading = false;
      return;
    }

    logsLoading = true;
    error = '';
    try {
      const sp = new URLSearchParams({ locale: get(locale), limit: '100' });
      if (query.trim()) sp.set('q', query.trim());
      if (dateFrom) sp.set('from', dateFrom);
      if (dateTo) sp.set('to', dateTo);
      const result = await queryApi<{
        items: Array<Record<string, unknown>>;
        total: number;
        retentionFrom: string;
      }>('apiQuery', `/api/admin/users/${userId}/logs?${sp}`);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t('error.unknown', get(locale) as Locale));
      }
      if (selectedUserId !== userId) return;
      userLogItems = result.data.items ?? [];
      userLogTotal = result.data.total ?? 0;
      retentionFrom = result.data.retentionFrom ?? retentionFrom;
    } catch (e) {
      if (selectedUserId !== userId) return;
      error = (e as Error).message;
      userLogItems = [];
      userLogTotal = 0;
    } finally {
      logsLoading = false;
    }
  }

  function describeUserLogRow(row: Record<string, unknown>) {
    return describeUserLog(
      {
        eventType: String(row.eventType ?? ''),
        kind: (row.kind as 'login' | 'activity') ?? 'activity',
        method: row.method as string | undefined,
        courseTitle: row.courseTitle as string | null | undefined,
        payload: (row.payload as Record<string, unknown>) ?? {},
      },
      $locale,
    );
  }

  async function loadActiveTab() {
    loading = true;
    error = '';
    try {
      if (activeTab === 'overview') {
        await Promise.all([loadOverview(), loadMedia()]);
      } else if (activeTab === 'audit') {
        await loadAudit();
      } else if (activeTab === 'auth') {
        await loadAuth();
      } else if (activeTab === 'health') {
        await loadHealth();
      } else if (activeTab === 'users') {
        await loadUsers();
      } else {
        await loadErrors();
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function exportSection(
    section: 'audit' | 'auth' | 'errors' | 'user',
    format: 'csv' | 'json',
    userId?: string,
  ) {
    const sp = new URLSearchParams({ section, format, limit: '200', offset: '0' });
    if (query.trim()) sp.set('q', query.trim());
    if (dateFrom) sp.set('from', dateFrom);
    if (dateTo) sp.set('to', dateTo);
    if (section === 'user' && userId) {
      sp.set('userId', userId);
      sp.set('locale', $locale);
    }

    const authToken = get(token);
    const res = await fetch(`/api/admin/reports/export?${sp}`, {
      credentials: 'include',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? t('admin.reports.exportFailed', $locale));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `youniversity2-${section}-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runExport(
    section: 'audit' | 'auth' | 'errors' | 'user',
    format: 'csv' | 'json',
    userId?: string,
  ) {
    error = '';
    try {
      await exportSection(section, format, userId);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function reloadUserLogs() {
    await loadUserLogs();
  }

  function onUserSelected(userId: string) {
    if (selectedUserId === userId) return;
    selectedUserId = userId;
  }

  async function refreshUsersTab() {
    error = '';
    if (activeTab === 'users') {
      await loadUsers();
      await loadUserLogs();
      return;
    }
    await loadActiveTab();
  }

  function setTab(tab: Tab) {
    activeTab = tab;
    void loadActiveTab();
  }

  onMount(() => {
    void loadActiveTab();
  });

  $effect(() => {
    if (activeTab !== 'users' || !selectedUserId) return;
    void loadUserLogs();
  });

  const stats24h = $derived((overview?.stats24h as Record<string, number> | undefined) ?? {});
  const platform = $derived((overview?.platform as Record<string, number> | undefined) ?? {});
  const healthSummary = $derived((overview?.health as { ok?: boolean } | undefined) ?? null);
  const incidents = $derived((overview?.recentIncidents as Array<Record<string, unknown>> | undefined) ?? []);
  const filteredUsers = $derived(
    allUsers.filter((u) => {
      const q = userSearch.trim().toLowerCase();
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }),
  );
  const selectedUser = $derived(allUsers.find((u) => u.id === selectedUserId) ?? null);
</script>

<div class="admin-reporting">
  <header class="admin-reporting-header admin-manage-header">
    <h1>{t('admin.settingsReportingTitle', $locale)}</h1>
    <p>{t('admin.settingsReportingSub', $locale)}</p>
  </header>

  <div class="admin-reporting-toolbar">
    <input
      type="search"
      placeholder={t('admin.reports.searchPlaceholder', $locale)}
      bind:value={query}
      disabled={activeTab === 'overview' || activeTab === 'health'}
    />
    <input type="date" bind:value={dateFrom} disabled={activeTab === 'health'} />
    <input type="date" bind:value={dateTo} disabled={activeTab === 'health'} />
    <button
      type="button"
      class="btn btn-sm"
      disabled={loading || (activeTab === 'users' && (usersLoading || logsLoading))}
      onclick={() => (activeTab === 'users' ? refreshUsersTab() : loadActiveTab())}
    >
      {t('admin.reports.refresh', $locale)}
    </button>
    <span class="admin-reporting-toolbar-spacer"></span>
    {#if activeTab === 'audit' || activeTab === 'auth' || activeTab === 'errors'}
      <div class="admin-reporting-export-group">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          disabled={loading}
          onclick={() => runExport(activeTab === 'errors' ? 'errors' : activeTab, 'csv')}
        >
          {t('admin.reports.exportCsv', $locale)}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          disabled={loading}
          onclick={() => runExport(activeTab === 'errors' ? 'errors' : activeTab, 'json')}
        >
          {t('admin.reports.exportJson', $locale)}
        </button>
      </div>
    {:else if activeTab === 'users' && selectedUserId}
      <div class="admin-reporting-export-group">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          disabled={loading || logsLoading}
          onclick={() => runExport('user', 'csv', selectedUserId)}
        >
          {t('admin.reports.exportCsv', $locale)}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          disabled={loading || logsLoading}
          onclick={() => runExport('user', 'json', selectedUserId)}
        >
          {t('admin.reports.exportJson', $locale)}
        </button>
      </div>
    {/if}
  </div>

  <nav class="admin-reporting-tabs" aria-label={t('admin.reports.tabsLabel', $locale)}>
    {#each [
      ['overview', 'admin.reports.tabOverview'],
      ['audit', 'admin.reports.tabAudit'],
      ['auth', 'admin.reports.tabAuth'],
      ['users', 'admin.reports.tabUsers'],
      ['health', 'admin.reports.tabHealth'],
      ['errors', 'admin.reports.tabErrors'],
    ] as const as [tab, labelKey]}
      <button
        type="button"
        class="admin-reporting-tab"
        class:admin-reporting-tab--active={activeTab === tab}
        onclick={() => setTab(tab)}
      >
        {t(labelKey, $locale)}
      </button>
    {/each}
  </nav>

  {#if error}
    <div class="admin-flash admin-flash--err">{error}</div>
  {/if}

  {#if loading && activeTab !== 'users'}
    <p class="admin-reporting-loading">{t('admin.reports.loading', $locale)}</p>
  {:else if activeTab === 'overview' && overview}
    <section class="admin-reporting-status-bar">
      <div>
        <p class="admin-reporting-kpi-label">{t('admin.reports.kpiSystemHealth', $locale)}</p>
        <span class="admin-reporting-badge {healthBadgeClass(healthSummary?.ok ? 'ok' : 'error')}">
          {healthSummary?.ok ? t('admin.reports.healthOk', $locale) : t('admin.reports.healthDegraded', $locale)}
        </span>
      </div>
      <p class="admin-reporting-status-bar-meta">
        {t('admin.reports.generatedAt', $locale, {
          time: formatDateTime(String(overview.generatedAt ?? new Date().toISOString())),
        })}
      </p>
    </section>

    <section class="admin-reporting-kpi-section">
      <h2 class="admin-reporting-kpi-section-title">{t('admin.reports.sectionSecurity24h', $locale)}</h2>
      <div class="admin-reporting-kpi-grid admin-reporting-kpi-grid--3">
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiAudit24h', $locale)}</p>
          <p class="admin-reporting-kpi-value">{stats24h.auditEvents ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiLogins24h', $locale)}</p>
          <p class="admin-reporting-kpi-value">{stats24h.successfulLogins ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiAuthFailures24h', $locale)}</p>
          <p class="admin-reporting-kpi-value">{stats24h.authFailures ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiApiErrors24h', $locale)}</p>
          <p class="admin-reporting-kpi-value">{stats24h.apiErrors ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiMediaOps24h', $locale)}</p>
          <p class="admin-reporting-kpi-value">{stats24h.mediaOperations ?? 0}</p>
        </article>
      </div>
    </section>

    <section class="admin-reporting-kpi-section">
      <h2 class="admin-reporting-kpi-section-title">{t('admin.reports.sectionPlatform', $locale)}</h2>
      <div class="admin-reporting-kpi-grid admin-reporting-kpi-grid--3">
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiTotalUsers', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.totalUsers ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiSuspendedUsers', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.suspendedUsers ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiActiveEnrollments', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.activeEnrollments ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiPublishedCourses', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.publishedCourses ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiScormPackages', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.scormPackages ?? 0}</p>
        </article>
        <article class="admin-reporting-kpi">
          <p class="admin-reporting-kpi-label">{t('admin.reports.kpiActivities', $locale)}</p>
          <p class="admin-reporting-kpi-value">{platform.activities ?? 0}</p>
        </article>
      </div>
    </section>

    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.recentIncidents', $locale)}</h2>
      </div>
      <div class="admin-reporting-panel-body">
        {#if incidents.length === 0}
          <p class="admin-reporting-empty">{t('admin.reports.noIncidents', $locale)}</p>
        {:else}
          <div class="admin-reporting-table-wrap">
            <table class="admin-reporting-table">
              <thead>
                <tr>
                  <th>{t('admin.reports.colTime', $locale)}</th>
                  <th>{t('admin.reports.colEvent', $locale)}</th>
                  <th>{t('admin.reports.colOutcome', $locale)}</th>
                  <th>{t('admin.reports.colReason', $locale)}</th>
                </tr>
              </thead>
              <tbody>
                {#each incidents as row (row.id)}
                  <tr>
                    <td>{formatDateTime(String(row.occurredAt))}</td>
                    <td class="admin-reporting-mono">{row.eventType}</td>
                    <td>
                      <span class="admin-reporting-badge {healthBadgeClass(String(row.outcome))}">
                        {row.outcome}
                      </span>
                    </td>
                    <td>{row.reasonCode ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      {#if mediaItems.length > 0}
        <p class="admin-reporting-retention">{t('admin.reports.mediaOpsHint', $locale)} ({mediaItems.length})</p>
      {/if}
      {#if retentionFrom}
        <p class="admin-reporting-retention">
          {t('admin.reports.retentionNote', $locale, { from: formatDateTime(retentionFrom) })}
        </p>
      {/if}
    </div>
  {:else if activeTab === 'audit'}
    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.auditTitle', $locale)}</h2>
      </div>
      <div class="admin-reporting-panel-body">
        {#if auditItems.length === 0}
          <p class="admin-reporting-empty">{t('admin.reports.empty', $locale)}</p>
        {:else}
          <div class="admin-reporting-table-wrap">
            <table class="admin-reporting-table">
              <thead>
                <tr>
                  <th>{t('admin.reports.colTime', $locale)}</th>
                  <th>{t('admin.reports.colActor', $locale)}</th>
                  <th>{t('admin.reports.colAction', $locale)}</th>
                  <th>{t('admin.reports.colType', $locale)}</th>
                </tr>
              </thead>
              <tbody>
                {#each auditItems as row (row.id)}
                  <tr>
                    <td>{formatDateTime(String(row.occurredAt))}</td>
                    <td>
                      {(row.actor as { name?: string })?.name ?? '—'}
                      <br />
                      <span class="admin-reporting-mono">{(row.actor as { email?: string })?.email ?? ''}</span>
                    </td>
                    <td>{describeAuditRow(row)}</td>
                    <td class="admin-reporting-mono">{row.eventType}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      {#if retentionFrom}
        <p class="admin-reporting-retention">
          {t('admin.reports.retentionNote', $locale, { from: formatDateTime(retentionFrom) })}
        </p>
      {/if}
    </div>
  {:else if activeTab === 'auth'}
    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.authTitle', $locale)}</h2>
      </div>
      <div class="admin-reporting-panel-body">
        {#if authItems.length === 0}
          <p class="admin-reporting-empty">{t('admin.reports.empty', $locale)}</p>
        {:else}
          <div class="admin-reporting-table-wrap">
            <table class="admin-reporting-table">
              <thead>
                <tr>
                  <th>{t('admin.reports.colTime', $locale)}</th>
                  <th>{t('admin.reports.colOutcome', $locale)}</th>
                  <th>{t('admin.reports.colEvent', $locale)}</th>
                  <th>{t('admin.reports.colUser', $locale)}</th>
                  <th>{t('admin.reports.colReason', $locale)}</th>
                </tr>
              </thead>
              <tbody>
                {#each authItems as row (row.id)}
                  <tr>
                    <td>{formatDateTime(String(row.occurredAt))}</td>
                    <td>
                      <span class="admin-reporting-badge {authBadgeClass(String(row.kind))}">
                        {row.kind}
                      </span>
                    </td>
                    <td>{authEventLabel(String(row.eventType))}</td>
                    <td>
                      {row.userName ?? row.userEmail ?? '—'}
                      {#if row.ipAddress}
                        <br /><span class="admin-reporting-mono">{row.ipAddress}</span>
                      {/if}
                    </td>
                    <td>{row.reasonCode ?? row.method ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {:else if activeTab === 'health' && health}
    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.healthTitle', $locale)}</h2>
        <span class="admin-reporting-badge {healthBadgeClass(health.ok ? 'ok' : 'error')}">
          {health.ok ? t('admin.reports.healthOk', $locale) : t('admin.reports.healthDegraded', $locale)}
        </span>
      </div>
      <div class="admin-reporting-health-grid">
        {#each Object.entries(health.checks as Record<string, string>) as [check, status]}
          <article class="admin-reporting-health-card">
            <h3>{healthLabel(check)}</h3>
            <span class="admin-reporting-badge {healthBadgeClass(status)}">{status}</span>
            {#if check === 'storage' && health.storageBucket}
              <p>{health.storageBucket}</p>
            {/if}
            {#if check === 'email'}
              <p>{t('admin.reports.emailNotConfigured', $locale)}</p>
            {/if}
          </article>
        {/each}
      </div>
      <p class="admin-reporting-retention">
        {t('admin.reports.healthMeta', $locale, {
          uptime: String(health.uptimeSec ?? 0),
          env: String(health.environment ?? '—'),
          checked: formatDateTime(String(health.checkedAt ?? new Date().toISOString())),
        })}
      </p>
    </div>
  {:else if activeTab === 'errors'}
    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.errorsTitle', $locale)}</h2>
      </div>
      <div class="admin-reporting-panel-body">
        {#if errorAggregates.length === 0 && errorRecent.length === 0}
          <p class="admin-reporting-empty">{t('admin.reports.noErrors', $locale)}</p>
        {:else}
          <div class="admin-reporting-table-wrap">
            <table class="admin-reporting-table">
              <thead>
                <tr>
                  <th>{t('admin.reports.colEvent', $locale)}</th>
                  <th>{t('admin.reports.colReason', $locale)}</th>
                  <th>{t('admin.reports.colCount', $locale)}</th>
                  <th>{t('admin.reports.colLastSeen', $locale)}</th>
                </tr>
              </thead>
              <tbody>
                {#each errorAggregates as row (`${row.eventType}-${row.reasonCode}`)}
                  <tr>
                    <td class="admin-reporting-mono">{row.eventType}</td>
                    <td>{row.reasonCode ?? '—'}</td>
                    <td>{row.count}</td>
                    <td>{formatDateTime(String(row.lastOccurredAt))}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {:else if activeTab === 'users'}
    <div class="admin-reporting-user-picker">
      <input
        type="search"
        placeholder={t('admin.reports.userSearchPlaceholder', $locale)}
        bind:value={userSearch}
      />
      <select
        value={selectedUserId}
        onchange={(e) => onUserSelected(e.currentTarget.value)}
        aria-label={t('admin.reports.userSelectLabel', $locale)}
        disabled={loading && usersLoading}
      >
        {#each filteredUsers as user (user.id)}
          <option value={user.id}>{user.name} · {user.email}</option>
        {/each}
      </select>
    </div>

    <div class="admin-reporting-panel">
      <div class="admin-reporting-panel-header">
        <h2>{t('admin.reports.usersTitle', $locale)}</h2>
        {#if selectedUser}
          <span class="admin-reporting-mono">{selectedUser.email}</span>
        {/if}
      </div>
      <div class="admin-reporting-panel-body">
        {#if usersLoading && allUsers.length === 0}
          <p class="admin-reporting-loading">{t('admin.reports.loading', $locale)}</p>
        {:else if !selectedUser}
          <p class="admin-reporting-empty">{t('admin.reports.userSelectHint', $locale)}</p>
        {:else if logsLoading}
          <p class="admin-reporting-loading">{t('admin.reports.loadingUserLogs', $locale)}</p>
        {:else if userLogItems.length === 0}
          <p class="admin-reporting-empty">{t('admin.userLogsEmpty', $locale)}</p>
        {:else}
          <p class="admin-reporting-retention" style="border-top: none; background: transparent;">
            {userLogTotal} {t('admin.userLogsEntries', $locale)}
          </p>
          <ViewportPaginator
            items={userLogItems}
            resetKey="{selectedUserId}|{query}|{dateFrom}|{dateTo}"
            rowHeight={48}
            headerOffset={360}
            footerReserved={180}
          >
            {#snippet children(pageItems)}
              <div class="admin-reporting-table-wrap">
                <table class="admin-reporting-table">
                  <thead>
                    <tr>
                      <th>{t('admin.reports.colTime', $locale)}</th>
                      <th>{t('admin.reports.colAction', $locale)}</th>
                      <th>{t('dash.courseName', $locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each pageItems as row (`${row.occurredAt}-${row.eventType}`)}
                      <tr>
                        <td>{formatDateTime(String(row.occurredAt))}</td>
                        <td>{describeUserLogRow(row)}</td>
                        <td>{(row.courseTitle as string) || '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/snippet}
          </ViewportPaginator>
        {/if}
      </div>
      {#if retentionFrom}
        <p class="admin-reporting-retention">
          {t('admin.reports.retentionNote', $locale, { from: formatDateTime(retentionFrom) })}
        </p>
      {/if}
    </div>
  {/if}
</div>

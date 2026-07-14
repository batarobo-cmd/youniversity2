<script lang="ts">
  import { browser } from '$app/environment';
  import { invalidate } from '$app/navigation';
  import { get } from 'svelte/store';
  import StudentDashboard from '$lib/components/StudentDashboard.svelte';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { subscribeDashboardRefresh } from '$lib/live-dashboard';
  import { scheduleNextPublicationRefresh } from '$lib/publication-refresh';
  import { user as authUser } from '$lib/stores/auth';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let dashboardError = $state<string | null>(data.dashboardError);
  let refreshing = $state(false);

  const dashboard = $derived(data.dashboard);

  $effect(() => {
    dashboardError = data.dashboardError;
  });

  $effect(() => {
    if (!dashboard || dashboard.role !== 'student') return;

    return scheduleNextPublicationRefresh(dashboard, () => {
      void refreshDashboard();
    });
  });

  $effect(() => {
    if (!browser) return;

    return subscribeDashboardRefresh(() => {
      void refreshDashboard();
    }, () => get(authUser)?.id);
  });

  async function refreshDashboard() {
    if (refreshing) return;
    refreshing = true;
    try {
      await invalidate('student:dashboard');
      dashboardError = null;
    } catch {
      /* ponechaj posledné zobrazené dáta */
    } finally {
      refreshing = false;
    }
  }
</script>

{#if dashboardError}
  <div class="form-error">{dashboardError}</div>
{:else if dashboard}
  {#if dashboard.role === 'student'}
    <StudentDashboard data={dashboard} />
  {:else}
    <AdminDashboard data={dashboard} />
  {/if}
{:else}
  <PageSkeleton variant="dashboard" ariaLabel={t('a11y.loading', $locale)} />
{/if}


<script lang="ts">
  import { onMount } from 'svelte';
  import StudentDashboard from '$lib/components/StudentDashboard.svelte';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';
  import { invalidate } from '$app/navigation';
  import { subscribeDashboardRefresh } from '$lib/live-dashboard';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let dashboard = $state(data.dashboard);
  let dashboardError = $state(data.dashboardError);
  let refreshing = $state(false);

  $effect(() => {
    dashboard = data.dashboard;
    dashboardError = data.dashboardError;
  });

  onMount(() => {
    return subscribeDashboardRefresh(() => {
      void refreshDashboard();
    });
  });

  async function refreshDashboard() {
    if (refreshing) return;
    refreshing = true;
    try {
      await invalidate('dashboard');
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
  <p class="loading-text">Načítavam dashboard...</p>
{/if}


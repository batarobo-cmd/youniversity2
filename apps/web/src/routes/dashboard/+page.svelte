<script lang="ts">
  import StudentDashboard from '$lib/components/StudentDashboard.svelte';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

{#if data.dashboardError}
  <div class="form-error">{data.dashboardError}</div>
{:else if data.dashboard}
  {#if data.dashboard.role === 'student'}
    <StudentDashboard data={data.dashboard} />
  {:else}
    <AdminDashboard data={data.dashboard} />
  {/if}
{:else}
  <p class="loading-text">Načítavam dashboard...</p>
{/if}

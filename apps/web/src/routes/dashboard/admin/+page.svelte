<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin } from '$lib/stores/auth';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let dashboard = $state(data.dashboard);
  let loading = $state(false);
  let error = $state(data.loadError ?? '');

  $effect(() => {
    dashboard = data.dashboard;
    error = data.loadError ?? '';
  });

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });
</script>

{#if error}
  <div class="form-error">{error}</div>
{/if}

{#if loading}
  <p style="color: var(--color-muted);">Načítavam...</p>
{:else if dashboard}
  <AdminDashboard data={dashboard} />
{/if}

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';

  let data = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);

  onMount(async () => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe(async (admin) => {
      if (!admin) goto('/dashboard');
      else await loadDashboard();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  async function loadDashboard() {
    loading = true;
    try {
      data = await api.getDashboard();
    } finally {
      loading = false;
    }
  }
</script>

{#if loading}
  <p style="color: var(--color-muted);">Načítavam...</p>
{:else if data}
  <AdminDashboard {data} />
{/if}

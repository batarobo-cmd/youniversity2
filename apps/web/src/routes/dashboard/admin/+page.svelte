<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin } from '$lib/stores/auth';
  import AdminDashboard from '$lib/components/AdminDashboard.svelte';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
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
  <PageSkeleton variant="dashboard" ariaLabel={t('a11y.loading', $locale)} />
{:else if dashboard}
  <AdminDashboard data={dashboard} />
{/if}

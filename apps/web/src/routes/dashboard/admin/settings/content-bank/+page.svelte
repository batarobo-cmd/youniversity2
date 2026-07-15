<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isPlatformAdmin } from '$lib/stores/auth';
  import AdminContentBank from '$lib/components/AdminContentBank.svelte';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-settings.css';
  import '$lib/styles/admin-reporting.css';
  import '$lib/styles/admin-content-bank.css';

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isPlatformAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });
</script>

<AdminContentBank />

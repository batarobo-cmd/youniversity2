<script lang="ts">
  import { page } from '$app/stores';
  import { isAdminSettingsPath } from '$lib/admin-nav';
  import AdminNavTiles from '$lib/components/AdminNavTiles.svelte';
  import AdminSettingsTabs from '$lib/components/AdminSettingsTabs.svelte';
  import '$lib/styles/admin-nav.css';

  let { children } = $props();

  const showSettingsNav = $derived(isAdminSettingsPath($page.url.pathname));
</script>

<div class="admin-shell">
  <div class="admin-nav-bar" class:admin-nav-bar--with-settings={showSettingsNav}>
    <div class="admin-nav-tiles-wrap">
      <AdminNavTiles />
    </div>
    {#if showSettingsNav}
      <AdminSettingsTabs />
    {/if}
  </div>
  <div class="admin-shell-content">
    {@render children()}
  </div>
</div>

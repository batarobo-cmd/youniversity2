<script lang="ts">
  import { page } from '$app/stores';
  import { locale, isPlatformAdminUser } from '$lib/stores/auth';
  import { user as authUser } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { getMainAdminNavTiles, isAdminNavTileActive, type AdminNavTile } from '$lib/admin-nav';
  import AdminSettingsIcon from '$lib/components/AdminSettingsIcon.svelte';

  let { onNavigate }: { onNavigate?: () => void } = $props();

  const tiles = $derived(getMainAdminNavTiles(isPlatformAdminUser($authUser)));

  function handleClick() {
    onNavigate?.();
  }

  function tileActive(tile: AdminNavTile) {
    return isAdminNavTileActive($page.url.pathname, tile);
  }
</script>

<nav class="admin-nav-tiles" aria-label={t('nav.administration', $locale)}>
  <div class="admin-nav-tiles-grid">
    {#each tiles as tile (tile.href)}
      <a
        href={tile.href}
        class="admin-nav-tile"
        class:admin-nav-tile--active={tileActive(tile)}
        aria-current={tileActive(tile) ? 'page' : undefined}
        onclick={handleClick}
      >
        <span class="admin-nav-tile-icon admin-nav-tile-icon--{tile.icon}" aria-hidden="true">
          <AdminSettingsIcon icon={tile.icon} />
        </span>
        <span class="admin-nav-tile-body">
          <span class="admin-nav-tile-title">{t(tile.titleKey, $locale)}</span>
          <span class="admin-nav-tile-desc">{t(tile.descKey, $locale)}</span>
          {#if tile.showStatus}
            {#if tile.ready}
              <span class="admin-nav-tile-meta">{t('admin.settingsReady', $locale)}</span>
            {:else}
              <span class="admin-nav-tile-meta admin-nav-tile-meta--soon">
                {t('admin.settingsComingSoon', $locale)}
              </span>
            {/if}
          {/if}
        </span>
        <svg class="admin-nav-tile-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </a>
    {/each}
  </div>
</nav>

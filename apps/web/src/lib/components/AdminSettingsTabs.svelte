<script lang="ts">
  import { page } from '$app/stores';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { getSettingsNavTiles, isAdminNavTileActive } from '$lib/admin-nav';
  import { adminSettingsSectionForPath } from '$lib/admin-settings-sections';
  import AdminSettingsIcon from '$lib/components/AdminSettingsIcon.svelte';

  const tabs = $derived(getSettingsNavTiles());
  const activeSection = $derived(adminSettingsSectionForPath($page.url.pathname));
  const activeTitle = $derived(
    activeSection ? t(activeSection.titleKey, $locale) : t('admin.menuSettings', $locale),
  );
</script>

<div class="admin-settings-context">
  <nav class="admin-settings-breadcrumb" aria-label={t('admin.settingsNav', $locale)}>
    <span class="admin-settings-breadcrumb-root">{t('admin.menuSettings', $locale)}</span>
    <svg class="admin-settings-breadcrumb-sep" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <span class="admin-settings-breadcrumb-current" aria-current="page">{activeTitle}</span>
  </nav>

  <div class="admin-settings-tabs" role="tablist" aria-label={t('admin.settingsNav', $locale)}>
    <div class="admin-settings-tabs-track">
      {#each tabs as tab (tab.href)}
        {@const active = isAdminNavTileActive($page.url.pathname, tab)}
        <a
          href={tab.href}
          class="admin-settings-tab"
          class:admin-settings-tab--active={active}
          role="tab"
          aria-selected={active}
          title={t(tab.descKey, $locale)}
        >
          <span class="admin-settings-tab-icon admin-settings-tab-icon--{tab.icon}" aria-hidden="true">
            <AdminSettingsIcon icon={tab.icon} />
          </span>
          <span class="admin-settings-tab-label">{t(tab.titleKey, $locale)}</span>
          {#if tab.showStatus && !tab.ready}
            <span class="admin-settings-tab-soon" aria-label={t('admin.settingsComingSoon', $locale)}></span>
          {/if}
        </a>
      {/each}
    </div>
  </div>
</div>

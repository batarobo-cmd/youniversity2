<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { AdminNavIcon } from '$lib/admin-nav';
  import AdminSettingsIcon from '$lib/components/AdminSettingsIcon.svelte';

  let {
    sectionId,
    titleKey,
    descKey,
    featureKeys,
  }: {
    sectionId: AdminNavIcon;
    titleKey: string;
    descKey: string;
    featureKeys: string[];
  } = $props();
</script>

<div class="admin-settings-planned">
  <div class="admin-settings-planned-hero">
    <span class="admin-settings-planned-icon admin-settings-planned-icon--{sectionId}" aria-hidden="true">
      <AdminSettingsIcon icon={sectionId} />
    </span>
    <div>
      <p class="admin-settings-planned-badge">{t('admin.settingsComingSoon', $locale)}</p>
      <h1>{t(titleKey, $locale)}</h1>
      <p class="admin-settings-planned-desc">{t(descKey, $locale)}</p>
    </div>
  </div>

  <div class="admin-settings-planned-card">
    <h2>{t('admin.settingsPlannedFeatures', $locale)}</h2>
    <ul class="admin-settings-planned-list">
      {#each featureKeys as key (key)}
        <li>
          <span class="admin-settings-planned-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>
          {t(key, $locale)}
        </li>
      {/each}
    </ul>
    <p class="admin-settings-planned-note">{t('admin.settingsPlannedNote', $locale)}</p>
  </div>
</div>

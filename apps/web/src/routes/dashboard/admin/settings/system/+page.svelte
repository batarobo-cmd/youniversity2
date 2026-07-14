<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, isPlatformAdmin, locale } from '$lib/stores/auth';
  import { submitAction, actionErrorMessage, isActionSuccess } from '$lib/client/form-action';
  import { t } from '$lib/i18n';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-settings.css';

  let { data }: { data: PageData } = $props();

  let saving = $state(false);
  let message = $state('');
  let mutationError = $state('');
  const error = $derived(
    mutationError ||
      (data.loadError === 'Internal Server Error'
        ? t('admin.settingsLoadFailed', $locale)
        : data.loadError) ||
      '',
  );
  const settingsReady = $derived(Boolean(data.systemSettings) && !data.loadError);

  let commandPaletteEnabled = $state(false);

  const shortcutLabel = $derived(
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K',
  );

  $effect(() => {
    if (data.systemSettings) {
      commandPaletteEnabled = data.systemSettings.commandPaletteEnabled;
    }
  });

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

  async function saveSettings(event: Event) {
    event.preventDefault();
    saving = true;
    message = '';
    mutationError = '';
    try {
      const result = await submitAction('saveSettings', {
        payload: JSON.stringify({ commandPaletteEnabled }),
      });
      const actionError = actionErrorMessage(result);
      if (!isActionSuccess(result) || actionError) {
        mutationError = actionError ?? t('admin.saveFailed', $locale);
        return;
      }
      message = commandPaletteEnabled
        ? t('admin.settingsSavedCommandPaletteOn', $locale)
        : t('admin.saved', $locale);
      await invalidate('admin:system');
      await invalidate('app:system-features');
    } finally {
      saving = false;
    }
  }
</script>

<div class="admin-manage-header">
  <h1>{t('admin.settingsSystemTitle', $locale)}</h1>
  <p>{t('admin.settingsSystemSub', $locale)}</p>
</div>

{#if message}
  <div class="admin-flash admin-flash--ok">{message}</div>
{/if}
{#if error}
  <div class="admin-flash admin-flash--err">{error}</div>
{/if}

{#if !settingsReady && !error}
  <PageSkeleton variant="generic" ariaLabel={t('a11y.loading', $locale)} />
{:else if settingsReady}
  <form class="admin-settings-form" onsubmit={saveSettings}>
    <section class="panel admin-settings-card">
      <div class="panel-body">
        <h2>{t('admin.settingsSystemShortcutsTitle', $locale)}</h2>
        <p class="admin-settings-card-lead">{t('admin.settingsSystemShortcutsSub', $locale)}</p>

        <div class="admin-settings-toggle-list">
          <div class="admin-settings-toggle-row">
            <div class="admin-settings-toggle-copy">
              <span class="admin-settings-toggle-title">
                {t('admin.settingsSystemCommandPalette', $locale)}
              </span>
              <p class="admin-settings-toggle-hint">
                {t('admin.settingsSystemCommandPaletteHint', $locale)}
              </p>
              <div class="admin-settings-toggle-meta">
                <span class="admin-settings-kbd">{shortcutLabel}</span>
              </div>
            </div>
            <label class="admin-settings-switch" title={t('admin.settingsSystemCommandPalette', $locale)}>
              <input
                type="checkbox"
                bind:checked={commandPaletteEnabled}
                aria-label={t('admin.settingsSystemCommandPalette', $locale)}
              />
              <span class="admin-settings-switch-track" aria-hidden="true"></span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <div class="admin-settings-actions">
      <button type="submit" class="btn btn-sm" disabled={saving}>
        {saving ? '…' : t('admin.saveChanges', $locale)}
      </button>
    </div>
  </form>
{/if}

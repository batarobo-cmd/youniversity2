<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, isAuthenticated, locale, setLocale, setAuth } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t, SUPPORTED_LOCALES } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import { SESSION_STORAGE_KEY } from '$lib/session';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import '$lib/styles/dashboard.css';

  let name = $state('');
  let preferredLocale = $state<Locale>('sk');
  let currentPassword = $state('');
  let newPassword = $state('');
  let message = $state('');
  let error = $state('');
  let saving = $state(false);

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubUser = user.subscribe((u) => {
      if (u) {
        name = u.name;
        preferredLocale = (u.preferredLocale as Locale) ?? 'sk';
      }
    });
    return () => {
      unsubAuth();
      unsubUser();
    };
  });

  async function saveProfile(e: Event) {
    e.preventDefault();
    error = '';
    message = '';
    saving = true;

    try {
      const payload: Record<string, string> = { name, preferredLocale };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const updated = await api.updateProfile(payload);
      setLocale(preferredLocale);
      const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
      if ($user && sessionId) setAuth(sessionId, { ...$user, ...updated });
      message = t('profile.saved', $locale);
      currentPassword = '';
      newPassword = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="profile-hero">
  <UserAvatar
    name={$user?.name ?? $user?.email ?? ''}
    avatarUrl={$user?.avatarUrl}
    size="lg"
  />
  <div class="profile-hero-text">
    <h1>{t('nav.profile', $locale)}</h1>
    <p>{t('profile.subtitle', $locale)}</p>
    <p class="profile-avatar-hint">{t('profile.avatarHint', $locale)}</p>
  </div>
</div>

<div class="panel" style="max-width: 520px;">
  <div class="panel-body">
    {#if message}
      <div class="form-success">{message}</div>
    {/if}
    {#if error}
      <div class="form-error">{error}</div>
    {/if}

    <form class="profile-form" onsubmit={saveProfile}>
      <div class="profile-section">
        <h2>{t('profile.general', $locale)}</h2>
        <div>
          <label for="email">{t('auth.email', $locale)}</label>
          <input id="email" type="email" value={$user?.email ?? ''} disabled />
        </div>
        <div>
          <label for="name">{t('auth.name', $locale)}</label>
          <input id="name" bind:value={name} required />
        </div>
        <div>
          <label for="pref-locale">{t('locale.label', $locale)}</label>
          <select id="pref-locale" bind:value={preferredLocale}>
            {#each SUPPORTED_LOCALES as loc}
              <option value={loc}>{loc.toUpperCase()}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="profile-section">
        <h2>{t('profile.security', $locale)}</h2>
        <div>
          <label for="current-pw">{t('profile.currentPassword', $locale)}</label>
          <input id="current-pw" type="password" bind:value={currentPassword} autocomplete="current-password" />
        </div>
        <div>
          <label for="new-pw">{t('profile.newPassword', $locale)}</label>
          <input id="new-pw" type="password" bind:value={newPassword} minlength="8" autocomplete="new-password" />
        </div>
      </div>

      <button type="submit" class="login-submit" disabled={saving}>
        {saving ? '...' : t('profile.save', $locale)}
      </button>
    </form>
  </div>
</div>

<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, token, locale, isAuthenticated, isAdmin, clearAuth, setLocale } from '$lib/stores/auth';
  import { connectWebSocket, disconnectWebSocket, wsStatus } from '$lib/stores/realtime';
  import { t, SUPPORTED_LOCALES } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';

  onMount(() => {
    const unsub = token.subscribe((t) => {
      if (t) connectWebSocket();
      else disconnectWebSocket();
    });
    return () => {
      unsub();
      disconnectWebSocket();
    };
  });

  function handleLocaleChange(e: Event) {
    setLocale((e.target as HTMLSelectElement).value as Locale);
  }

  function logout() {
    clearAuth();
    goto('/login');
  }
</script>

{#if $page.url.pathname !== '/login'}
  <header style="border-bottom: 1px solid var(--color-border); padding: 0.75rem 1.5rem; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface);">
    <div style="display: flex; align-items: center; gap: 2rem;">
      <a href="/" style="font-weight: 700; font-size: 1.2rem; color: var(--color-text); text-decoration: none;">
        {t('app.title', $locale)}
      </a>
      {#if $isAuthenticated}
        <nav style="display: flex; gap: 1rem;">
          <a href="/courses">{t('nav.courses', $locale)}</a>
          {#if $isAdmin}
            <a href="/admin">{t('nav.admin', $locale)}</a>
          {/if}
        </nav>
      {/if}
    </div>

    <div style="display: flex; align-items: center; gap: 1rem;">
      <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--color-muted);">
        {t('locale.label', $locale)}
        <select value={$locale} onchange={handleLocaleChange} style="width: auto;">
          {#each SUPPORTED_LOCALES as loc}
            <option value={loc}>{loc.toUpperCase()}</option>
          {/each}
        </select>
      </label>

      {#if $isAuthenticated}
        <span style="font-size: 0.85rem; color: var(--color-muted);">
          {$user?.name}
          <span class="badge badge-success" style="margin-left: 0.4rem;">
            {$wsStatus === 'connected' ? '🟢' : '🔴'}
          </span>
        </span>
        <button onclick={logout} style="background: transparent; border: 1px solid var(--color-border); color: var(--color-text);">
          {t('nav.logout', $locale)}
        </button>
      {/if}
    </div>
  </header>
{/if}

<main style="max-width: 1200px; margin: 0 auto; padding: 1.5rem;">
  <slot />
</main>

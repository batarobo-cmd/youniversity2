<script lang="ts">
  import { get } from 'svelte/store';
  import { locale, setLocale, user, setAuth } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import type { Locale, User } from '@youniversity2/shared';
  import { SUPPORTED_LOCALES as LOCALES } from '@youniversity2/shared';
  import { SESSION_STORAGE_KEY } from '$lib/session';

  let { user: userProp = null }: { user?: User | null } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let pendingLocale = $state<Locale | null>(null);
  let savingPreferred = $state(false);
  let skipNextOutsideClose = $state(false);

  const localeLabels: Record<Locale, string> = {
    sk: 'Slovenčina',
    en: 'English',
    cs: 'Čeština',
    de: 'Deutsch',
    hu: 'Magyar',
  };

  const profileLocale = $derived(
    (($user ?? userProp)?.preferredLocale as Locale | undefined) ?? 'sk',
  );

  function resolvedUser(): User | null {
    return get(user) ?? userProp ?? null;
  }

  function closeMenu() {
    open = false;
    pendingLocale = null;
    skipNextOutsideClose = false;
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (open) closeMenu();
    else {
      pendingLocale = null;
      open = true;
    }
  }

  function pick(loc: Locale, e: MouseEvent) {
    e.stopPropagation();

    if (loc === get(locale)) {
      closeMenu();
      return;
    }

    setLocale(loc);

    const currentUser = resolvedUser();
    const preferred = (currentUser?.preferredLocale as Locale | undefined) ?? 'sk';
    if (currentUser && loc !== preferred) {
      pendingLocale = loc;
      open = true;
      skipNextOutsideClose = true;
      return;
    }

    closeMenu();
  }

  async function answerPreferred(save: boolean, e: MouseEvent) {
    e.stopPropagation();
    const loc = pendingLocale;
    closeMenu();
    if (!save || !loc) return;

    savingPreferred = true;
    try {
      const updated = await api.updateProfile({ preferredLocale: loc });
      const sessionId =
        typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
      const currentUser = resolvedUser();
      if (currentUser && sessionId) {
        setAuth(sessionId, { ...currentUser, ...updated });
      }
    } catch (err) {
      console.warn('[locale] failed to save preferred locale:', (err as Error).message);
    } finally {
      savingPreferred = false;
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (skipNextOutsideClose) {
      skipNextOutsideClose = false;
      return;
    }
    if (!rootEl.contains(e.target as Node)) closeMenu();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeMenu();
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="locale-menu" bind:this={rootEl}>
  <button
    type="button"
    class="icon-btn"
    class:icon-btn--active={open}
    aria-label={t('locale.label', $locale)}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggle}
  >
    <svg class="icon-btn-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" />
      <path
        d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    </svg>
  </button>

  {#if open}
    <div
      class="locale-menu-popover"
      role={pendingLocale ? 'alertdialog' : 'listbox'}
      aria-label={t('locale.label', $locale)}
      onclick={(e) => e.stopPropagation()}
    >
      {#if pendingLocale}
        <div class="locale-menu-confirm">
          <p class="locale-menu-confirm-text">
            {t('locale.setPreferredConfirm', $locale, { language: localeLabels[pendingLocale] })}
          </p>
          <div class="locale-menu-confirm-actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm locale-menu-confirm-btn"
              disabled={savingPreferred}
              onclick={(e) => answerPreferred(false, e)}
            >
              {t('locale.noTemporary', $locale)}
            </button>
            <button
              type="button"
              class="btn btn-sm locale-menu-confirm-btn"
              disabled={savingPreferred}
              onclick={(e) => answerPreferred(true, e)}
            >
              {t('locale.yesPreferred', $locale)}
            </button>
          </div>
        </div>
      {:else}
        {#each LOCALES as loc}
          <button
            type="button"
            role="option"
            aria-selected={$locale === loc}
            class="locale-menu-item"
            class:locale-menu-item--active={$locale === loc}
            disabled={savingPreferred}
            onclick={(e) => pick(loc, e)}
          >
            <span class="locale-menu-code">{loc.toUpperCase()}</span>
            <span class="locale-menu-name">{localeLabels[loc]}</span>
            {#if profileLocale === loc}
              <span class="locale-menu-profile-badge" title={t('locale.preferredBadge', $locale)}>
                ★
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .locale-menu {
    position: relative;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      color var(--duration-fast),
      border-color var(--duration-fast),
      background var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .icon-btn:hover,
  .icon-btn--active {
    color: var(--color-primary);
    border-color: rgba(99, 102, 241, 0.35);
    background: var(--color-primary-muted);
    transform: none;
    box-shadow: none;
  }

  .icon-btn-svg {
    width: 18px;
    height: 18px;
  }

  .locale-menu-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 260px;
    max-width: min(20rem, calc(100vw - 1.5rem));
    padding: 0.375rem;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    z-index: 200;
    animation: fadeSlideUp var(--duration-fast) var(--ease-out) both;
  }

  .locale-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    transition: background var(--duration-fast);
  }

  .locale-menu-item:hover:not(:disabled) {
    background: var(--color-surface-hover);
    transform: none;
    box-shadow: none;
  }

  .locale-menu-item--active {
    background: var(--color-primary-muted);
  }

  .locale-menu-code {
    min-width: 1.75rem;
    font-weight: 700;
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }

  .locale-menu-item--active .locale-menu-code {
    color: var(--color-primary);
  }

  .locale-menu-name {
    flex: 1;
  }

  .locale-menu-profile-badge {
    font-size: 0.6875rem;
    color: var(--color-warning);
    line-height: 1;
  }

  .locale-menu-confirm {
    padding: 0.5rem 0.375rem 0.375rem;
  }

  .locale-menu-confirm-text {
    margin: 0 0 0.75rem;
    padding: 0 0.25rem;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }

  .locale-menu-confirm-actions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .locale-menu-confirm-btn {
    width: 100%;
    justify-content: center;
  }
</style>

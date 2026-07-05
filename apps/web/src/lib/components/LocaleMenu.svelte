<script lang="ts">
  import { locale, setLocale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import { SUPPORTED_LOCALES as LOCALES } from '@youniversity2/shared';

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const localeLabels: Record<Locale, string> = {
    sk: 'Slovenčina',
    en: 'English',
    cs: 'Čeština',
    de: 'Deutsch',
    hu: 'Magyar',
  };

  function toggle() {
    open = !open;
  }

  function pick(loc: Locale) {
    setLocale(loc);
    open = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
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
    <div class="locale-menu-popover" role="listbox" aria-label={t('locale.label', $locale)}>
      {#each LOCALES as loc}
        <button
          type="button"
          role="option"
          aria-selected={$locale === loc}
          class="locale-menu-item"
          class:locale-menu-item--active={$locale === loc}
          onclick={() => pick(loc)}
        >
          <span class="locale-menu-code">{loc.toUpperCase()}</span>
          <span class="locale-menu-name">{localeLabels[loc]}</span>
          {#if $locale === loc}
            <svg class="locale-menu-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12l4 4L19 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {/if}
        </button>
      {/each}
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
    min-width: 168px;
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

  .locale-menu-item:hover {
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

  .locale-menu-check {
    width: 14px;
    height: 14px;
    color: var(--color-primary);
    flex-shrink: 0;
  }
</style>

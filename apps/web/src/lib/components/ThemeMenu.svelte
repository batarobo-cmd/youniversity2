<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { themePreference, setThemePreference, type ThemePreference } from '$lib/stores/theme';
  import { t } from '$lib/i18n';

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const options: ThemePreference[] = ['light', 'dark', 'system'];

  function toggle() {
    open = !open;
  }

  function pick(value: ThemePreference) {
    setThemePreference(value);
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

<div class="theme-menu" bind:this={rootEl}>
  <button
    type="button"
    class="icon-btn"
    class:icon-btn--active={open}
    aria-label={t('theme.label', $locale)}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggle}
  >
    <svg class="icon-btn-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {#if $themePreference === 'dark'}
        <path
          d="M21 14.5A8.5 8.5 0 0110.5 4 7 7 0 0014.5 21a8.5 8.5 0 006.5-6.5z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
        />
      {:else if $themePreference === 'light'}
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.75" />
        <path
          d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
      {:else}
        <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.75" />
        <path d="M8 20h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
      {/if}
    </svg>
  </button>

  {#if open}
    <div class="theme-menu-popover" role="listbox" aria-label={t('theme.label', $locale)}>
      {#each options as option}
        <button
          type="button"
          role="option"
          aria-selected={$themePreference === option}
          class="theme-menu-item"
          class:theme-menu-item--active={$themePreference === option}
          onclick={() => pick(option)}
        >
          <span>{t(`theme.${option}`, $locale)}</span>
          {#if $themePreference === option}
            <svg class="theme-menu-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  .theme-menu {
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
      background var(--duration-fast);
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

  .theme-menu-popover {
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

  .theme-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .theme-menu-item:hover {
    background: var(--color-surface-hover);
    transform: none;
    box-shadow: none;
  }

  .theme-menu-item--active {
    background: var(--color-primary-muted);
  }

  .theme-menu-check {
    width: 14px;
    height: 14px;
    color: var(--color-primary);
    flex-shrink: 0;
  }
</style>

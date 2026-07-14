<script lang="ts">
  import { goto } from '$app/navigation';
  import { locale, isPlatformAdminUser, isActingAsStudent, user } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import {
    buildCommandPaletteItems,
    filterCommandPaletteItems,
    type CommandPaletteItem,
  } from '$lib/command-palette';

  let { open = $bindable(false), enabled = true }: { open?: boolean; enabled?: boolean } = $props();
  let query = $state('');
  let activeIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  const items = $derived(
    buildCommandPaletteItems($locale, {
      platformAdmin: isPlatformAdminUser($user),
      studentMode: $isActingAsStudent,
    }),
  );

  const filtered = $derived(filterCommandPaletteItems(items, query));

  const grouped = $derived.by(() => {
    const map = new Map<string, CommandPaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  });

  const flatFiltered = $derived(filtered);

  $effect(() => {
    if (!open) return;
    activeIndex = 0;
    queueMicrotask(() => inputEl?.focus());
  });

  $effect(() => {
    query;
    activeIndex = 0;
  });

  function hide() {
    open = false;
    query = '';
  }

  function run(item: CommandPaletteItem) {
    hide();
    void goto(item.href);
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (!enabled) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatFiltered.length === 0) return;
      activeIndex = (activeIndex + 1) % flatFiltered.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatFiltered.length === 0) return;
      activeIndex = (activeIndex - 1 + flatFiltered.length) % flatFiltered.length;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatFiltered[activeIndex];
      if (item) run(item);
    }
  }

  function flatIndexFor(item: CommandPaletteItem): number {
    return flatFiltered.findIndex((entry) => entry.id === item.id);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="command-palette-backdrop"
    role="presentation"
    onclick={hide}
    onkeydown={(e) => e.key === 'Escape' && hide()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="command-palette" role="dialog" aria-modal="true" aria-label={t('command.title', $locale)} onclick={(e) => e.stopPropagation()}>
      <div class="command-palette-input-wrap">
        <svg class="command-palette-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.75" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
        <input
          bind:this={inputEl}
          class="command-palette-input"
          type="search"
          bind:value={query}
          placeholder={t('command.placeholder', $locale)}
          aria-controls="command-palette-list"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="command-palette-kbd">Esc</kbd>
      </div>

      <div class="command-palette-list" id="command-palette-list" role="listbox">
        {#if flatFiltered.length === 0}
          <p class="command-palette-empty">{t('command.empty', $locale)}</p>
        {:else}
          {#each grouped as [group, groupItems] (group)}
            <p class="command-palette-group">{group}</p>
            {#each groupItems as item (item.id)}
              {@const idx = flatIndexFor(item)}
              <button
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                class="command-palette-item"
                class:command-palette-item--active={idx === activeIndex}
                onclick={() => run(item)}
                onmouseenter={() => {
                  activeIndex = idx;
                }}
              >
                <span>{item.label}</span>
                <span class="command-palette-item-path">{item.href}</span>
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="command-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> {t('command.navigate', $locale)}</span>
        <span><kbd>↵</kbd> {t('command.open', $locale)}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .command-palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: min(12vh, 6rem) 1rem 1rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
  }

  .command-palette {
    width: min(100%, 560px);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: fadeSlideUp 160ms var(--ease-out) both;
  }

  .command-palette-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .command-palette-search-icon {
    width: 18px;
    height: 18px;
    color: var(--color-muted);
    flex-shrink: 0;
  }

  .command-palette-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: 0.9375rem;
    outline: none;
  }

  .command-palette-kbd,
  .command-palette-footer kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-muted);
    font-family: inherit;
    font-size: 0.625rem;
    line-height: 1.2;
  }

  .command-palette-list {
    max-height: min(50vh, 360px);
    overflow: auto;
    padding: 0.375rem;
  }

  .command-palette-group {
    padding: 0.375rem 0.625rem 0.25rem;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .command-palette-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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

  .command-palette-item:hover,
  .command-palette-item--active {
    background: var(--color-primary-muted);
    transform: none;
    box-shadow: none;
  }

  .command-palette-item-path {
    color: var(--color-muted);
    font-size: 0.6875rem;
    white-space: nowrap;
  }

  .command-palette-empty {
    padding: 1.25rem 0.75rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
    text-align: center;
  }

  .command-palette-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-top: 1px solid var(--color-border);
    color: var(--color-muted);
    font-size: 0.6875rem;
  }

  .command-palette-footer span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>

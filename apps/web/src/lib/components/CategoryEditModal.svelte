<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  type Category = { id: string; slug: string; name: string };

  let {
    category = null,
    open = false,
    saving = false,
    error = '',
    slugify,
    onSave,
    onClose,
  }: {
    category?: Category | null;
    open?: boolean;
    saving?: boolean;
    error?: string;
    slugify: (value: string) => string;
    onSave: (id: string, name: string, slug: string) => Promise<void>;
    onClose: () => void;
  } = $props();

  let name = $state('');
  let slug = $state('');
  let idManual = $state(false);

  $effect(() => {
    if (open && category) {
      name = category.name;
      slug = category.slug;
      idManual = true;
    }
  });

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('cat-modal-backdrop')) onClose();
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!category) return;
    const trimmedName = name.trim();
    const finalSlug = slug.trim() || slugify(trimmedName);
    if (finalSlug.length < 2) return;
    await onSave(category.id, trimmedName, finalSlug);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && onClose()} />

{#if open && category}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="cat-modal-backdrop" onclick={handleBackdrop} role="presentation">
    <div class="cat-modal" role="dialog" aria-modal="true" aria-labelledby="cat-modal-title">
      <div class="cat-modal-header">
        <h2 id="cat-modal-title">{t('admin.editCategory', $locale)}</h2>
        <button type="button" class="cat-modal-close" aria-label={t('admin.cancel', $locale)} onclick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <form class="cat-modal-body" onsubmit={submit}>
        <div class="cat-tree-field">
          <label for="edit-cat-name">{t('admin.categoryName', $locale)}</label>
          <input
            id="edit-cat-name"
            bind:value={name}
            required
            oninput={() => {
              if (!idManual) slug = slugify(name);
            }}
          />
        </div>
        <div class="cat-tree-field">
          <label for="edit-cat-id">{t('admin.categoryId', $locale)}</label>
          <input
            id="edit-cat-id"
            bind:value={slug}
            oninput={() => {
              idManual = true;
            }}
          />
          <span class="cat-tree-field-hint">{t('admin.idAutoHint', $locale)}</span>
        </div>

        {#if error}
          <p class="cat-tree-form-error">{error}</p>
        {/if}

        <div class="cat-modal-actions">
          <button type="submit" class="btn btn-sm" disabled={saving}>
            {saving ? '…' : t('admin.saveChanges', $locale)}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>
            {t('admin.cancel', $locale)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .cat-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.15s ease;
  }

  .cat-modal {
    width: 100%;
    max-width: 440px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    animation: fadeSlideUp 0.2s var(--ease-out);
  }

  .cat-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.125rem 1.25rem 0.75rem;
  }

  .cat-modal-header h2 {
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .cat-modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
  }

  .cat-modal-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .cat-modal-close svg {
    width: 18px;
    height: 18px;
  }

  .cat-modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0 1.25rem 1.25rem;
  }

  .cat-modal-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>

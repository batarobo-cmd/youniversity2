<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { locale, isAdminUser, studentViewMode, setStudentViewMode } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { User } from '@youniversity2/shared';

  let { user = null }: { user?: User | null } = $props();

  const canToggle = $derived(isAdminUser(user));
  const active = $derived($studentViewMode && canToggle);

  async function toggle() {
    if (!canToggle) return;
    const next = !$studentViewMode;
    setStudentViewMode(next);
    await invalidateAll();
    if (next) {
      await goto('/dashboard');
    } else if (get(page).url.pathname.startsWith('/courses')) {
      await goto('/dashboard');
    }
  }
</script>

{#if canToggle}
  <div class="student-view-toggle" class:student-view-toggle--active={active}>
    <button
      type="button"
      class="student-view-toggle-btn"
      role="switch"
      aria-checked={active}
      aria-label={active ? t('studentView.exit', $locale) : t('studentView.enter', $locale)}
      title={active ? t('studentView.exit', $locale) : t('studentView.enter', $locale)}
      onclick={toggle}
    >
      <span class="student-view-toggle-track" aria-hidden="true">
        <span class="student-view-toggle-thumb"></span>
      </span>
      <span class="student-view-toggle-label">
        <svg class="student-view-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
            stroke="currentColor"
            stroke-width="1.75"
          />
          <path
            d="M6 20v-1a6 6 0 0 1 12 0v1"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
        <span class="student-view-toggle-text">{t('studentView.label', $locale)}</span>
      </span>
    </button>
  </div>
{/if}

<style>
  .student-view-toggle {
    display: flex;
    align-items: center;
  }

  .student-view-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.375rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      color var(--duration-fast),
      border-color var(--duration-fast),
      background var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .student-view-toggle-btn:hover {
    color: var(--color-primary);
    border-color: rgba(99, 102, 241, 0.35);
    background: var(--color-primary-muted);
    transform: none;
    box-shadow: none;
  }

  .student-view-toggle--active .student-view-toggle-btn {
    color: var(--color-primary);
    border-color: rgba(99, 102, 241, 0.45);
    background: var(--color-primary-muted);
    box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.15);
  }

  .student-view-toggle-track {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: var(--radius-full);
    background: var(--color-border);
    flex-shrink: 0;
    transition: background var(--duration-fast);
  }

  .student-view-toggle--active .student-view-toggle-track {
    background: var(--color-primary);
  }

  .student-view-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
    transition: transform var(--duration-fast) var(--ease-out);
  }

  .student-view-toggle--active .student-view-toggle-thumb {
    transform: translateX(14px);
  }

  .student-view-toggle-label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .student-view-toggle-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .student-view-toggle-text {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .student-view-toggle-text {
      display: none;
    }

    .student-view-toggle-btn {
      padding: 0.3125rem;
    }
  }
</style>

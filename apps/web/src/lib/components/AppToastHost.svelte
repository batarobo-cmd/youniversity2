<script lang="ts">
  import { portal } from '$lib/actions/portal';
  import { toasts, dismissToast, type ToastItem } from '$lib/toast';
  import { t } from '$lib/i18n';
  import { locale } from '$lib/stores/auth';
  import '$lib/styles/app-toast.css';

  let items = $state<ToastItem[]>([]);

  $effect(() => {
    const unsub = toasts.subscribe((value) => {
      items = value;
    });
    return unsub;
  });
</script>

<div class="app-toast-host" use:portal={'body'} aria-live="polite" aria-atomic="false">
  {#each items as toast (toast.id)}
    <div class="app-toast app-toast--{toast.type}" role="status">
      <span class="app-toast__icon" aria-hidden="true">
        {#if toast.type === 'success'}
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="M5 10.5l3 3 7-7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        {:else}
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="M10 6v5M10 14h.01M18 10a8 8 0 11-16 0 8 8 0 0116 0z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
            />
          </svg>
        {/if}
      </span>
      <p class="app-toast__message">{toast.message}</p>
      <button
        type="button"
        class="app-toast__close"
        aria-label={t('toast.dismiss', $locale)}
        onclick={() => dismissToast(toast.id)}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/each}
</div>

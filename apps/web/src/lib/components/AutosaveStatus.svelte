<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { AutosaveStatus } from '$lib/autosave';

  let {
    status = 'idle',
    error = '',
  }: {
    status?: AutosaveStatus;
    error?: string;
  } = $props();

  const label = $derived.by(() => {
    if (status === 'pending') return t('admin.autosavePending', $locale);
    if (status === 'saving') return t('admin.autosaveSaving', $locale);
    if (status === 'saved') return t('admin.autosaveSaved', $locale);
    if (status === 'error') return error || t('admin.autosaveError', $locale);
    return '';
  });
</script>

{#if label}
  <span
    class="autosave-status"
    class:autosave-status--pending={status === 'pending'}
    class:autosave-status--saving={status === 'saving'}
    class:autosave-status--saved={status === 'saved'}
    class:autosave-status--error={status === 'error'}
    role="status"
    aria-live="polite"
  >
    {label}
  </span>
{/if}

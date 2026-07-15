<script lang="ts">
  import { EMAIL_TEMPLATE_VARIABLES } from '@youniversity2/shared';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';

  type Props = {
    locale: Locale;
    compact?: boolean;
    oninsert?: (token: string) => void;
  };

  let { locale, compact = false, oninsert }: Props = $props();

  function token(name: string) {
    return `{{${name}}}`;
  }

  function handleInsert(name: string) {
    oninsert?.(token(name));
  }
</script>

<div class="email-vars" class:email-vars--compact={compact}>
  <span class="email-vars-label">{t('email.templateVarsHint', locale)}</span>
  <div class="email-vars-chips" role="list">
    {#each EMAIL_TEMPLATE_VARIABLES as variable (variable)}
      <button
        type="button"
        class="email-var-chip"
        role="listitem"
        title={t('email.insertVariable', locale)}
        onclick={() => handleInsert(variable)}
      >
        {token(variable)}
      </button>
    {/each}
  </div>
</div>

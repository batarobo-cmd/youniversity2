<script lang="ts">
  import EmailTemplateVariables from '$lib/components/EmailTemplateVariables.svelte';
  import { getEmailTemplateHealth } from '@youniversity2/shared';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';

  type TimingField = {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    onchange: (value: number) => void;
  };

  type Props = {
    id: string;
    title: string;
    description: string;
    locale: Locale;
    enabled: boolean;
    subject: string;
    bodyHtml: string;
    categoryLabel?: string;
    globalEquivalentLabel?: string;
    globalEquivalentEnabled?: boolean;
    timingFields?: TimingField[];
    onpatch: (patch: {
      enabled?: boolean;
      subject?: string;
      bodyHtml?: string;
    }) => void;
  };

  let {
    id,
    title,
    description,
    locale,
    enabled,
    subject,
    bodyHtml,
    categoryLabel,
    globalEquivalentLabel,
    globalEquivalentEnabled = false,
    timingFields = [],
    onpatch,
  }: Props = $props();

  let expanded = $state(false);
  let editorTab = $state<'edit' | 'preview'>('edit');
  let focusTarget = $state<'subject' | 'body'>('subject');

  const templateHealth = $derived(getEmailTemplateHealth(enabled, subject, bodyHtml));

  function insertToken(token: string) {
    if (focusTarget === 'subject') {
      onpatch({ subject: subject + token });
      return;
    }
    onpatch({ bodyHtml: bodyHtml + token });
  }

  function previewHtml(html: string) {
    const samples: Record<string, string> = {
      userName: 'Ján Novák',
      userEmail: 'student@example.com',
      courseTitle: 'Úvod do LMS',
      courseUrl: 'https://example.com/courses/demo',
      platformName: 'YOUniversity2',
      daysRemaining: '7',
      daysSinceEnrollment: '7',
      daysInactive: '14',
      certificateNumber: 'AB12CD34',
      enrollmentDate: '1. 1. 2026',
      courseStartDate: '15. 1. 2026',
      courseEndDate: '31. 3. 2026',
    };
    return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => samples[key] ?? `{{${key}}}`);
  }
</script>

<article
  class="email-msg-card"
  class:email-msg-card--expanded={expanded}
  data-health={templateHealth.health}
>
  <header class="email-msg-card__head">
    <details class="email-msg-card__disclosure" bind:open={expanded}>
      <summary class="email-msg-card__summary" aria-expanded={expanded}>
        <svg
          class="email-msg-card__chevron"
          class:email-msg-card__chevron--open={expanded}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7.5 5l5 5-5 5"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="email-msg-card__titles">
          <strong class="email-msg-card__title">{title}</strong>
          {#if expanded}
            {#if categoryLabel}
              <span class="email-msg-card__category">{categoryLabel}</span>
            {/if}
            <span class="email-msg-card__desc">{description}</span>
          {/if}
        </span>
      </summary>
    </details>

    <div class="email-msg-card__actions">
      <span
        class="email-msg-card__status"
        class:email-msg-card__status--on={enabled}
        class:email-msg-card__status--error={templateHealth.health === 'error'}
      >
        {#if templateHealth.health === 'error'}
          {t('email.statusError', locale)}
        {:else}
          {enabled ? t('email.statusOn', locale) : t('email.statusOff', locale)}
        {/if}
      </span>
      <label class="admin-settings-switch" title={t('email.enabledLabel', locale)}>
        <input
          type="checkbox"
          checked={enabled}
          onchange={(e) => {
            onpatch({ enabled: e.currentTarget.checked });
          }}
          aria-label={t('email.enabledLabel', locale)}
        />
        <span class="admin-settings-switch-track" aria-hidden="true"></span>
      </label>
    </div>
  </header>

  {#if expanded}
    {#if enabled}
      <div class="email-msg-card__body">
        {#if globalEquivalentLabel}
          <p
            class="email-msg-card__global-equiv"
            class:email-msg-card__global-equiv--active={globalEquivalentEnabled}
          >
            {#if globalEquivalentEnabled}
              {t('email.reminder.globalEquivalentReplace', locale).replace(
                '{{name}}',
                globalEquivalentLabel,
              )}
            {:else}
              {t('email.reminder.globalEquivalentInactive', locale).replace(
                '{{name}}',
                globalEquivalentLabel,
              )}
            {/if}
          </p>
        {/if}

        {#if templateHealth.invalidVariables.length > 0}
          <div class="email-msg-card__alert" role="alert">
            {t('email.invalidVariables', locale)}:
            {#each templateHealth.invalidVariables as name}
              <code>{'{{' + name + '}}'}</code>
            {/each}
          </div>
        {/if}

        {#if timingFields.length > 0}
          <div class="email-msg-card__timing">
            {#each timingFields as field (field.id)}
              <div class="email-msg-card__timing-item">
                <label for="{id}-{field.id}">{field.label}</label>
                <div class="email-msg-card__timing-input">
                  <input
                    id="{id}-{field.id}"
                    type="number"
                    min={field.min ?? 0}
                    max={field.max ?? 365}
                    value={field.value}
                    oninput={(e) => field.onchange(Number(e.currentTarget.value) || 0)}
                  />
                  <span>{t('email.daysUnit', locale)}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <EmailTemplateVariables {locale} compact oninsert={insertToken} />

        <div class="email-msg-card__field">
          <label for="{id}-subject">{t('email.subjectLabel', locale)}</label>
          <input
            id="{id}-subject"
            type="text"
            class:email-msg-card__input--error={templateHealth.invalidVariables.length > 0 &&
              templateHealth.invalidVariables.some((v) => subject.includes(`{{${v}}}`))}
            value={subject}
            onfocus={() => (focusTarget = 'subject')}
            oninput={(e) => onpatch({ subject: e.currentTarget.value })}
          />
        </div>

        <div class="email-msg-card__editor">
          <div class="email-msg-card__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="email-msg-card__tab"
              class:email-msg-card__tab--active={editorTab === 'edit'}
              aria-selected={editorTab === 'edit'}
              onclick={() => (editorTab = 'edit')}
            >
              {t('email.editTab', locale)}
            </button>
            <button
              type="button"
              role="tab"
              class="email-msg-card__tab"
              class:email-msg-card__tab--active={editorTab === 'preview'}
              aria-selected={editorTab === 'preview'}
              onclick={() => (editorTab = 'preview')}
            >
              {t('email.previewTab', locale)}
            </button>
          </div>

          {#if editorTab === 'edit'}
            <textarea
              id="{id}-body"
              class="email-msg-card__textarea"
              class:email-msg-card__input--error={templateHealth.invalidVariables.length > 0}
              rows="6"
              value={bodyHtml}
              onfocus={() => (focusTarget = 'body')}
              oninput={(e) => onpatch({ bodyHtml: e.currentTarget.value })}
            ></textarea>
          {:else}
            <div class="email-msg-card__preview">
              {@html previewHtml(bodyHtml)}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="email-msg-card__paused-wrap">
        {#if globalEquivalentLabel}
          <p
            class="email-msg-card__global-equiv"
            class:email-msg-card__global-equiv--active={globalEquivalentEnabled}
          >
            {#if globalEquivalentEnabled}
              {t('email.reminder.globalEquivalentReplace', locale).replace(
                '{{name}}',
                globalEquivalentLabel,
              )}
            {:else}
              {t('email.reminder.globalEquivalentInactive', locale).replace(
                '{{name}}',
                globalEquivalentLabel,
              )}
            {/if}
          </p>
        {/if}
        <p class="email-msg-card__paused">{t('email.messagePaused', locale)}</p>
      </div>
    {/if}
  {/if}
</article>

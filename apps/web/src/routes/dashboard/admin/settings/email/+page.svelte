<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, isPlatformAdmin, locale } from '$lib/stores/auth';
  import { submitAction, actionErrorMessage, isActionSuccess } from '$lib/client/form-action';
  import {
    PLATFORM_NOTIFICATION_META,
    type PlatformNotificationId,
    type NotificationTemplateConfig,
  } from '@youniversity2/shared';
  import EmailMessageCard from '$lib/components/EmailMessageCard.svelte';
  import { showToast } from '$lib/toast';
  import { t } from '$lib/i18n';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-settings.css';

  type SmtpForm = {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    useStartTls: boolean;
    username: string;
    password: string;
    hasPassword: boolean;
    configured: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
  };

  type NotificationCategory = 'account' | 'enrollment' | 'course' | 'progress' | 'reminder';

  const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    'account',
    'enrollment',
    'course',
    'progress',
    'reminder',
  ];

  let { data }: { data: PageData } = $props();

  let saving = $state(false);
  let testing = $state(false);
  let mutationError = $state('');
  let testEmail = $state('');
  let saveFeedback = $state<'idle' | 'saved'>('idle');
  let saveFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let savedBaseline = $state<string | null>(null);

  const error = $derived(
    mutationError ||
      (data.loadError === 'Internal Server Error'
        ? t('admin.settingsLoadFailed', $locale)
        : data.loadError) ||
      '',
  );
  const settingsReady = $derived(Boolean(data.emailSettings) && !data.loadError);
  const enabledNotificationCount = $derived(
    Object.values(platformNotifications).filter((item) => item?.enabled).length,
  );

  let platformName = $state('YOUniversity2');
  let smtp = $state<SmtpForm>({
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    useStartTls: true,
    username: '',
    password: '',
    hasPassword: false,
    configured: false,
    fromEmail: '',
    fromName: 'YOUniversity2',
    replyTo: '',
  });
  let platformNotifications = $state<Record<PlatformNotificationId, NotificationTemplateConfig>>(
    {} as Record<PlatformNotificationId, NotificationTemplateConfig>,
  );
  let hydratedSettingsKey = $state<string | null>(null);

  $effect(() => {
    const raw = data.emailSettings as
      | {
          platformName?: string;
          smtp?: SmtpForm;
          platformNotifications?: Record<PlatformNotificationId, NotificationTemplateConfig>;
        }
      | null
      | undefined;
    if (!raw) return;

    const nextKey = JSON.stringify(raw);
    if (hydratedSettingsKey === nextKey) return;

    hydratedSettingsKey = nextKey;
    platformName = raw.platformName ?? 'YOUniversity2';
    if (raw.smtp) {
      smtp = {
        ...raw.smtp,
        password: '',
      };
    }
    if (raw.platformNotifications) {
      platformNotifications = { ...raw.platformNotifications };
    }
    savedBaseline = JSON.stringify({
      platformName: raw.platformName ?? 'YOUniversity2',
      smtp: {
        ...raw.smtp,
        password: '',
      },
      platformNotifications: raw.platformNotifications ?? {},
    });
  });

  const draftKey = $derived(JSON.stringify(buildPayload()));
  const isDirty = $derived(savedBaseline !== null && draftKey !== savedBaseline);

  $effect(() => {
    if (isDirty && saveFeedback === 'saved') {
      saveFeedback = 'idle';
      if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
    }
  });

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isPlatformAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  function patchNotification(id: PlatformNotificationId, patch: Partial<NotificationTemplateConfig>) {
    platformNotifications = {
      ...platformNotifications,
      [id]: { ...platformNotifications[id], ...patch },
    };
  }

  function notificationsForCategory(category: NotificationCategory) {
    return PLATFORM_NOTIFICATION_META.filter((meta) => meta.category === category);
  }

  function buildPayload() {
    const smtpPayload: Record<string, unknown> = {
      enabled: smtp.enabled,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      useStartTls: smtp.useStartTls,
      username: smtp.username,
      fromEmail: smtp.fromEmail,
      fromName: smtp.fromName,
      replyTo: smtp.replyTo,
    };
    if (smtp.password.trim()) smtpPayload.password = smtp.password;

    return {
      platformName,
      smtp: smtpPayload,
      platformNotifications,
    };
  }

  function markSaved() {
    const loc = get(locale);
    saveFeedback = 'saved';
    showToast(t('toast.changesSaved', loc), 'success', 4500);
    if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = setTimeout(() => {
      saveFeedback = 'idle';
    }, 4500);
  }

  async function saveSettings(event: Event) {
    event.preventDefault();
    if (!isDirty || saving) return;
    saving = true;
    mutationError = '';
    const loc = get(locale);
    try {
      const result = await submitAction('saveSettings', {
        payload: JSON.stringify(buildPayload()),
      });
      const actionError = actionErrorMessage(result, loc);
      if (!isActionSuccess(result) || actionError) {
        mutationError = actionError ?? t('admin.saveFailed', loc);
        showToast(mutationError, 'error');
        return;
      }
      smtp.password = '';
      savedBaseline = JSON.stringify(buildPayload());
      markSaved();
      await invalidate('admin:email');
    } finally {
      saving = false;
    }
  }

  async function sendTest(event: Event) {
    event.preventDefault();
    if (!testEmail.trim()) return;
    testing = true;
    mutationError = '';
    const loc = get(locale);
    try {
      const result = await submitAction('sendTest', {
        payload: JSON.stringify({ to: testEmail.trim() }),
      });
      const actionError = actionErrorMessage(result, loc);
      if (!isActionSuccess(result) || actionError) {
        mutationError = actionError ?? t('email.testFailed', loc);
        showToast(mutationError, 'error');
        return;
      }
      showToast(t('email.testSent', loc), 'success');
    } finally {
      testing = false;
    }
  }
</script>

<div class="admin-manage-header">
  <h1>{t('admin.settingsEmailTitle', $locale)}</h1>
  <p>{t('admin.settingsEmailSub', $locale)}</p>
</div>

{#if error}
  <div class="admin-flash admin-flash--err">{error}</div>
{/if}

{#if !settingsReady && !error}
  <PageSkeleton variant="generic" ariaLabel={t('a11y.loading', $locale)} />
{:else if settingsReady}
  <form class="admin-settings-form email-settings-page" onsubmit={saveSettings}>
    <section class="panel admin-settings-card email-smtp-card">
      <div class="panel-body">
        <header class="email-section-head email-section-head--inline">
          <div>
            <h2>{t('email.smtpTitle', $locale)}</h2>
            <p>{t('email.smtpSub', $locale)}</p>
          </div>
          <div class="email-smtp-head-actions">
            <span
              class="email-status-pill"
              class:email-status-pill--ok={smtp.configured && smtp.enabled}
              class:email-status-pill--warn={!smtp.configured}
            >
              {smtp.configured && smtp.enabled
                ? t('email.smtpConfigured', $locale)
                : t('email.smtpNotConfigured', $locale)}
            </span>
            <label class="admin-settings-switch" title={t('email.smtpEnabled', $locale)}>
              <input type="checkbox" bind:checked={smtp.enabled} aria-label={t('email.smtpEnabled', $locale)} />
              <span class="admin-settings-switch-track" aria-hidden="true"></span>
            </label>
          </div>
        </header>

        <p class="email-smtp-enabled-hint">{t('email.smtpEnabledHint', $locale)}</p>

        <div class="email-smtp-grid">
          <fieldset class="email-fieldset">
            <legend>{t('email.smtpConnection', $locale)}</legend>
            <div class="email-fieldset-grid">
              <div class="email-field">
                <label for="smtp-host">{t('email.smtpHost', $locale)}</label>
                <input id="smtp-host" type="text" bind:value={smtp.host} autocomplete="off" placeholder="smtp.example.com" />
              </div>
              <div class="email-field email-field--narrow">
                <label for="smtp-port">{t('email.smtpPort', $locale)}</label>
                <input id="smtp-port" type="number" min="1" max="65535" bind:value={smtp.port} />
              </div>
              <div class="email-field">
                <label for="smtp-user">{t('email.smtpUsername', $locale)}</label>
                <input id="smtp-user" type="text" bind:value={smtp.username} autocomplete="off" />
              </div>
              <div class="email-field">
                <label for="smtp-pass">{t('email.smtpPassword', $locale)}</label>
                <input
                  id="smtp-pass"
                  type="password"
                  bind:value={smtp.password}
                  placeholder={smtp.hasPassword ? t('email.smtpPasswordKeep', $locale) : ''}
                  autocomplete="new-password"
                />
              </div>
            </div>
            <div class="email-smtp-options">
              <label class="email-option-pill">
                <input type="checkbox" bind:checked={smtp.secure} />
                <span>{t('email.smtpSecure', $locale)}</span>
              </label>
              <label class="email-option-pill">
                <input type="checkbox" bind:checked={smtp.useStartTls} />
                <span>{t('email.smtpStartTls', $locale)}</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="email-fieldset">
            <legend>{t('email.smtpIdentity', $locale)}</legend>
            <div class="email-fieldset-grid">
              <div class="email-field">
                <label for="platform-name">{t('email.platformNameLabel', $locale)}</label>
                <input id="platform-name" type="text" bind:value={platformName} />
              </div>
              <div class="email-field">
                <label for="smtp-from">{t('email.smtpFrom', $locale)}</label>
                <input id="smtp-from" type="email" bind:value={smtp.fromEmail} autocomplete="off" />
              </div>
              <div class="email-field">
                <label for="smtp-from-name">{t('email.smtpFromName', $locale)}</label>
                <input id="smtp-from-name" type="text" bind:value={smtp.fromName} />
              </div>
              <div class="email-field">
                <label for="smtp-reply">{t('email.smtpReplyTo', $locale)}</label>
                <input id="smtp-reply" type="email" bind:value={smtp.replyTo} autocomplete="off" />
              </div>
            </div>
          </fieldset>
        </div>

        <div class="email-test-panel">
          <div>
            <strong>{t('email.testTitle', $locale)}</strong>
            <p>{t('email.testSub', $locale)}</p>
          </div>
          <div class="email-test-row">
            <input type="email" bind:value={testEmail} placeholder={t('email.testPlaceholder', $locale)} />
            <button type="button" class="btn btn-sm btn-secondary" disabled={testing || !testEmail.trim()} onclick={sendTest}>
              {testing ? '…' : t('email.testSend', $locale)}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel admin-settings-card email-notifications-card">
      <div class="panel-body">
        <header class="email-section-head">
          <div>
            <h2>{t('email.notificationsTitle', $locale)}</h2>
            <p>{t('email.notificationsSub', $locale)}</p>
          </div>
          <span class="email-section-badge">
            {enabledNotificationCount}/{PLATFORM_NOTIFICATION_META.length} {t('email.activeCount', $locale)}
          </span>
        </header>

        {#each NOTIFICATION_CATEGORIES as category}
          {@const items = notificationsForCategory(category)}
          {#if items.length > 0}
            <section class="email-notify-group">
              <h3 class="email-notify-group__title">{t(`email.category.${category}`, $locale)}</h3>
              <div class="email-msg-list">
                {#each items as meta (meta.id)}
                  {@const item = platformNotifications[meta.id]}
                  {#if item}
                    <EmailMessageCard
                      id={meta.id}
                      locale={$locale}
                      title={t(meta.titleKey, $locale)}
                      description={t(meta.descKey, $locale)}
        categoryLabel={t(`email.category.${meta.category}`, $locale)}
                      enabled={item.enabled}
                      subject={item.subject}
                      bodyHtml={item.bodyHtml}
                      onpatch={(next) => patchNotification(meta.id, next)}
                    />
                  {/if}
                {/each}
              </div>
            </section>
          {/if}
        {/each}
      </div>
    </section>

    <div class="admin-settings-actions admin-settings-actions--sticky">
      {#if !isDirty && saveFeedback === 'saved'}
        <p class="email-save-feedback" role="status">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 10.5l3 3 7-7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('toast.changesSaved', $locale)}
        </p>
      {/if}
      <button
        type="submit"
        class="btn btn-sm"
        class:btn--saved={!isDirty && saveFeedback === 'saved'}
        disabled={saving || !isDirty}
        title={!isDirty ? t('email.noChangesToSave', $locale) : undefined}
      >
        {#if saving}
          …
        {:else}
          {t('admin.saveChanges', $locale)}
        {/if}
      </button>
    </div>
  </form>
{/if}

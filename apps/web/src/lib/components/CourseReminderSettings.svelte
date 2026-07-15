<script lang="ts">
  import { get } from 'svelte/store';
  import {
    COURSE_REMINDER_META,
    PLATFORM_NOTIFICATION_META,
    defaultCourseReminders,
    type CourseReminderId,
    type CourseReminderTemplateConfig,
    type PlatformNotificationId,
  } from '@youniversity2/shared';
  import EmailMessageCard from '$lib/components/EmailMessageCard.svelte';
  import { serverMutate } from '$lib/client/form-action';
  import { showToast } from '$lib/toast';
  import { locale as localeStore } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import '$lib/styles/admin-settings.css';

  type Props = {
    courseId: string;
    locale: Locale;
    courseLocale: 'sk' | 'en';
    storedReminders?: Partial<Record<CourseReminderId, CourseReminderTemplateConfig>>;
    platformNotifications?: Partial<Record<PlatformNotificationId, { enabled?: boolean }>>;
    onsaved?: () => void | Promise<void>;
  };

  let {
    courseId,
    locale,
    courseLocale,
    storedReminders = {},
    platformNotifications = {},
    onsaved,
  }: Props = $props();

  let reminders = $state<Partial<Record<CourseReminderId, CourseReminderTemplateConfig>>>({});
  let savedBaseline = $state<string | null>(null);
  let saving = $state(false);
  let saveFeedback = $state<'idle' | 'saved'>('idle');
  let saveFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let hydratedCourseId = $state<string | null>(null);

  const defaults = $derived(defaultCourseReminders(courseLocale));
  const draftKey = $derived(JSON.stringify(reminders));
  const isDirty = $derived(savedBaseline !== null && draftKey !== savedBaseline);

  $effect(() => {
    const stored = storedReminders ? structuredClone(storedReminders) : {};
    const storedKey = JSON.stringify(stored);

    if (hydratedCourseId !== courseId) {
      hydratedCourseId = courseId;
      reminders = stored;
      savedBaseline = storedKey;
      saveFeedback = 'idle';
      return;
    }

    if (!isDirty && storedKey !== savedBaseline) {
      reminders = stored;
      savedBaseline = storedKey;
    }
  });

  $effect(() => {
    if (isDirty && saveFeedback === 'saved') {
      saveFeedback = 'idle';
      if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
    }
  });

  function merged(id: CourseReminderId): CourseReminderTemplateConfig {
    const base = defaults[id];
    const stored = reminders[id];
    return {
      enabled: stored?.enabled ?? base.enabled,
      subject: stored?.subject?.trim() || base.subject,
      bodyHtml: stored?.bodyHtml?.trim() || base.bodyHtml,
      daysBefore: stored?.daysBefore ?? base.daysBefore,
      daysAfterEnrollment: stored?.daysAfterEnrollment ?? base.daysAfterEnrollment,
      daysInactive: stored?.daysInactive ?? base.daysInactive,
      repeatEveryDays: stored?.repeatEveryDays ?? base.repeatEveryDays,
    };
  }

  function patch(id: CourseReminderId, patch: Partial<CourseReminderTemplateConfig>) {
    reminders = {
      ...reminders,
      [id]: { ...merged(id), ...patch },
    };
  }

  function globalEquivalentFor(meta: (typeof COURSE_REMINDER_META)[number]) {
    const platformId = meta.platformEquivalentId;
    if (!platformId) return null;
    const titleKey = PLATFORM_NOTIFICATION_META.find((item) => item.id === platformId)?.titleKey;
    if (!titleKey) return null;
    return {
      label: t(titleKey, locale),
      enabled: platformNotifications[platformId]?.enabled ?? false,
    };
  }

  function timingFields(meta: (typeof COURSE_REMINDER_META)[number], item: CourseReminderTemplateConfig) {
    const fields = [];
    if (meta.daysBeforeTarget) {
      fields.push({
        id: 'days-before',
        label:
          meta.daysBeforeTarget === 'start'
            ? t('email.daysBeforeStartLabel', locale)
            : t('email.daysBeforeEndLabel', locale),
        value: item.daysBefore ?? (meta.daysBeforeTarget === 'start' ? 3 : 7),
        min: 0,
        onchange: (value: number) => patch(meta.id, { daysBefore: value }),
      });
    }
    if (meta.hasDaysAfterEnrollment) {
      fields.push({
        id: 'days-after',
        label: t('email.daysAfterEnrollmentLabel', locale),
        value: item.daysAfterEnrollment ?? 7,
        min: 0,
        onchange: (value: number) => patch(meta.id, { daysAfterEnrollment: value }),
      });
    }
    if (meta.hasDaysInactive) {
      fields.push({
        id: 'days-inactive',
        label: t('email.daysInactiveLabel', locale),
        value: item.daysInactive ?? 14,
        min: 1,
        onchange: (value: number) => patch(meta.id, { daysInactive: value }),
      });
    }
    if (meta.hasRepeatEveryDays) {
      fields.push({
        id: 'repeat-every',
        label: t('email.repeatEveryDaysLabel', locale),
        value: item.repeatEveryDays ?? 7,
        min: 1,
        onchange: (value: number) => patch(meta.id, { repeatEveryDays: value }),
      });
    }
    return fields;
  }

  function markSaved() {
    const loc = get(localeStore);
    saveFeedback = 'saved';
    showToast(t('toast.changesSaved', loc), 'success', 4500);
    if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = setTimeout(() => {
      saveFeedback = 'idle';
    }, 4500);
  }

  async function saveReminders(event: Event) {
    event.preventDefault();
    if (!isDirty || saving) return;
    saving = true;
    const loc = get(localeStore);
    try {
      await serverMutate('apiMutation', `/api/courses/${courseId}/notifications`, 'PATCH', {
        reminders,
      });
      savedBaseline = JSON.stringify(reminders);
      markSaved();
      await onsaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.saveFailed', loc);
      showToast(message, 'error');
    } finally {
      saving = false;
    }
  }
</script>

<form class="email-reminders-shell" onsubmit={saveReminders}>
  <header class="email-section-head">
    <div>
      <h2>{t('email.courseRemindersTitle', locale)}</h2>
      <p>{t('email.courseRemindersSub', locale)}</p>
    </div>
    <span class="email-section-badge">{COURSE_REMINDER_META.length} {t('email.rulesCount', locale)}</span>
  </header>

  <div class="email-msg-list">
    {#each COURSE_REMINDER_META as meta (meta.id)}
      {@const item = merged(meta.id)}
      {@const globalEquivalent = globalEquivalentFor(meta)}
      <EmailMessageCard
        id={meta.id}
        {locale}
        title={t(meta.titleKey, locale)}
        description={t(meta.descKey, locale)}
        categoryLabel={t('email.category.reminder', locale)}
        globalEquivalentLabel={globalEquivalent?.label}
        globalEquivalentEnabled={globalEquivalent?.enabled ?? false}
        enabled={item.enabled}
        subject={item.subject}
        bodyHtml={item.bodyHtml}
        timingFields={timingFields(meta, item)}
        onpatch={(next) => patch(meta.id, next)}
      />
    {/each}
  </div>

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
        {t('toast.changesSaved', locale)}
      </p>
    {/if}
    <button
      type="submit"
      class="btn btn-sm"
      class:btn--saved={!isDirty && saveFeedback === 'saved'}
      disabled={saving || !isDirty}
      title={!isDirty ? t('email.noChangesToSave', locale) : undefined}
    >
      {#if saving}
        …
      {:else}
        {t('admin.saveChanges', locale)}
      {/if}
    </button>
  </div>
</form>

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { mutateApi, serverMutate } from '$lib/client/form-action';
  import { t } from '$lib/i18n';
  import StudentSearchPicker from '$lib/components/StudentSearchPicker.svelte';
  import CourseActivityEditor from '$lib/components/CourseActivityEditor.svelte';
  import { moduleActivities, normalizeActivityType, isEvaluableActivity } from '$lib/activity-types';
  import type { PageData } from './$types';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-users.css';
  import '$lib/styles/course-edit.css';

  type Tab = 'settings' | 'content' | 'evaluation' | 'students' | 'certificate' | 'reporting';

  type CompletionRule = {
    id?: string;
    type: string;
    config?: Record<string, unknown>;
    isRequired?: boolean;
  };

  type EnrollmentRow = {
    enrollment: { id: string; status: string; enrolledAt: string };
    user: { id: string; name: string; email: string };
  };

  type CertRow = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
    userName: string;
    userEmail: string;
  };

  type ReportingRow = {
    user: { id: string; name: string; email: string };
    enrollment: { id: string; status: string; enrolledAt: string; completedAt?: string | null } | null;
    progress: {
      totalActivities: number;
      completedActivities: number;
      progressPercent: number;
      started: boolean;
    };
    completions: Array<{ id: string; certificateNumber: string; issuedAt: string }>;
  };

  let { data }: { data: PageData } = $props();

  const courseId = $derived($page.params.id);
  let activeTab = $state<Tab>('content');
  let loading = $state(false);
  let saving = $state(false);
  let message = $state('');
  let error = $state(data.loadError ?? '');

  let course = $state<Record<string, unknown> | null>(data.course);
  let title = $state('');
  let slug = $state('');
  let description = $state('');
  let publicationMode = $state<'manual' | 'schedule'>('manual');
  let publishManual = $state(false);
  let publishStartsAt = $state('');
  let publishEndsAt = $state('');

  let evalRules = $state<CompletionRule[]>([]);
  let mandatoryByActivityId = $state<Record<string, boolean>>({});

  let enrollments = $state<EnrollmentRow[]>(data.enrollments as EnrollmentRow[]);
  let enrollUserId = $state('');
  let studentSearch = $state<{ reset: () => void } | null>(null);

  let certEnabled = $state(false);
  let certTitle = $state('');
  let issuedCerts = $state<CertRow[]>(data.certificates as CertRow[]);
  let reportingRows = $state<ReportingRow[]>(data.reporting as ReportingRow[]);
  let certHistoryModal = $state<{ userName: string; completions: ReportingRow['completions'] } | null>(null);

  function toLocalDateTimeInput(value: unknown): string {
    if (!value) return '';
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toIsoOrNull(localValue: string): string | null {
    if (!localValue) return null;
    const d = new Date(localValue);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  function applyCourseData(
    c: Record<string, unknown> | null,
    enr: EnrollmentRow[],
    certs: CertRow[],
    reporting: ReportingRow[],
  ) {
    if (!c) return;
    course = c;
    title = String(c.title ?? '');
    slug = String(c.slug ?? '');
    description = String(c.description ?? '');
    publishManual = Boolean(c.isPublished);
    publishStartsAt = toLocalDateTimeInput(c.startsAt);
    publishEndsAt = toLocalDateTimeInput(c.endsAt);
    publicationMode = publishStartsAt || publishEndsAt ? 'schedule' : 'manual';
    parseRules((c.completionRules as CompletionRule[]) ?? []);
    syncMandatoryFromCourse(c);
    enrollments = enr;
    issuedCerts = certs;
    reportingRows = reporting;
  }

  $effect(() => {
    error = data.loadError ?? '';
    applyCourseData(
      data.course,
      data.enrollments as EnrollmentRow[],
      data.certificates as CertRow[],
      data.reporting as ReportingRow[],
    );
  });

  function parseRules(rules: CompletionRule[]) {
    const evalOnly = rules.filter((r) => !(r.config as { certificate?: unknown })?.certificate);
    const certRule = rules.find((r) => (r.config as { certificate?: unknown })?.certificate) as
      | CompletionRule
      | undefined;
    evalRules = evalOnly.length
      ? evalOnly
      : [{ type: 'all_lessons_complete', config: {}, isRequired: true }];
    const cert = (certRule?.config as { certificate?: { enabled?: boolean; titleTemplate?: string } })
      ?.certificate;
    certEnabled = cert?.enabled ?? false;
    certTitle = cert?.titleTemplate ?? '';
  }

  function syncMandatoryFromCourse(c: Record<string, unknown> | null) {
    if (!c) return;
    const next: Record<string, boolean> = {};
    for (const mod of (c.modules as Array<Record<string, unknown>>) ?? []) {
      for (const activity of moduleActivities(mod)) {
        if (!isEvaluableActivity(activity as { type?: string })) continue;
        next[activity.id as string] = (activity as { isRequired?: boolean }).isRequired !== false;
      }
    }
    mandatoryByActivityId = next;
  }

  function evaluationModules() {
    return [...modules]
      .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number))
      .map((mod) => ({
        ...mod,
        activities: moduleActivities(mod)
          .filter((activity) => isEvaluableActivity(activity as { type?: string }))
          .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number)),
      }))
      .filter((mod) => mod.activities.length > 0);
  }

  function mandatoryActivityCount() {
    return Object.values(mandatoryByActivityId).filter(Boolean).length;
  }

  function activityTypeLabel(type: string) {
    const normalized = normalizeActivityType(type);
    const key = `activity.type.${normalized}`;
    const label = t(key, $locale);
    return label === key ? normalized : label;
  }

  function setMandatory(activityId: string, checked: boolean) {
    mandatoryByActivityId = { ...mandatoryByActivityId, [activityId]: checked };
  }

  function mandatoryCountInModule(mod: { activities: Array<Record<string, unknown>> }) {
    return mod.activities.filter((activity) => mandatoryByActivityId[activity.id as string]).length;
  }

  async function refreshCourse() {
    loading = true;
    error = '';
    try {
      await invalidate('course:edit');
    } finally {
      loading = false;
    }
  }

  async function saveSettings(e: Event) {
    e.preventDefault();
    saving = true;
    message = '';
    error = '';
    try {
      const startsAt = publicationMode === 'schedule' ? toIsoOrNull(publishStartsAt) : null;
      const endsAt = publicationMode === 'schedule' ? toIsoOrNull(publishEndsAt) : null;
      if (publicationMode === 'schedule' && !startsAt) {
        throw new Error(t('admin.publishStartRequired', $locale));
      }
      if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
        throw new Error(t('admin.publishDateRangeInvalid', $locale));
      }

      await serverMutate('apiMutation', `/api/courses/${courseId}/content`, 'PATCH', {
        title: title.trim(),
        description,
        slug: slug.trim(),
        isPublished: publicationMode === 'schedule' ? true : publishManual,
        startsAt,
        endsAt,
        locale: $locale,
      });
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function saveEvaluation(e: Event) {
    e.preventDefault();
    saving = true;
    message = '';
    error = '';
    try {
      if (mandatoryActivityCount() === 0) {
        throw new Error(t('admin.evaluationMandatoryRequired', $locale));
      }

      for (const mod of modules) {
        for (const activity of moduleActivities(mod)) {
          if (!isEvaluableActivity(activity as { type?: string })) continue;
          const activityId = activity.id as string;
          const shouldBeRequired = mandatoryByActivityId[activityId] ?? false;
          const currentRequired = (activity as { isRequired?: boolean }).isRequired !== false;
          if (shouldBeRequired === currentRequired) continue;
          await serverMutate('apiMutation', `/api/activities/${activityId}`, 'PATCH', {
            isRequired: shouldBeRequired,
          });
        }
      }

      const rules: CompletionRule[] = [{ type: 'all_lessons_complete', config: {}, isRequired: true }];
      await serverMutate('apiMutation', `/api/courses/${courseId}/completion-rules`, 'PUT', {
        rules,
        certificate: certEnabled ? { enabled: true, titleTemplate: certTitle.trim() } : undefined,
      });
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function saveCertificate(e: Event) {
    e.preventDefault();
    saving = true;
    message = '';
    error = '';
    try {
      const rules = evalRules.filter((r) => !(r.config as { certificate?: unknown })?.certificate);
      await serverMutate('apiMutation', `/api/courses/${courseId}/completion-rules`, 'PUT', {
        rules: rules.length ? rules : [{ type: 'all_lessons_complete', config: {}, isRequired: true }],
        certificate: {
          enabled: certEnabled,
          titleTemplate: certTitle.trim() || title,
        },
      });
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function addEnrollment() {
    if (!enrollUserId) return;
    saving = true;
    error = '';
    try {
      await serverMutate('apiMutation', '/api/enrollments', 'POST', { userId: enrollUserId, courseId });
      enrollUserId = '';
      studentSearch?.reset();
      message = t('admin.enrolled', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function restoreEnrollment(userId: string) {
    saving = true;
    error = '';
    try {
      await serverMutate('apiMutation', '/api/enrollments', 'POST', { userId, courseId });
      message = t('admin.enrolled', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function revokeEnrollment(id: string) {
    if (!confirm(t('admin.revokeEnrollmentConfirm', $locale))) return;
    saving = true;
    try {
      await serverMutate('apiMutation', `/api/enrollments/${id}`, 'DELETE');
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function deleteEnrollmentPermanently(id: string) {
    if (!confirm(t('admin.deleteEnrollmentConfirm', $locale))) return;
    saving = true;
    try {
      await serverMutate('apiMutation', `/api/enrollments/${id}/permanent`, 'DELETE');
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function suspendEnrollment(id: string) {
    if (!confirm(t('admin.suspendEnrollmentConfirm', $locale))) return;
    saving = true;
    try {
      await serverMutate('apiMutation', `/api/enrollments/${id}/suspend`, 'POST');
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function unsuspendEnrollment(id: string) {
    if (!confirm(t('admin.unsuspendEnrollmentConfirm', $locale))) return;
    saving = true;
    try {
      await serverMutate('apiMutation', `/api/enrollments/${id}/unsuspend`, 'POST');
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function reloadCourse() {
    await invalidate('course:edit');
  }

  const modules = $derived((course?.modules as Array<Record<string, unknown>>) ?? []);

  const assignedEnrollments = $derived(
    enrollments.filter((row) => row.enrollment.status !== 'revoked'),
  );

  const assignedUserIds = $derived(assignedEnrollments.map((row) => row.user.id));

  function canSuspendEnrollment(status: string) {
    return status === 'active' || status === 'completed' || status === 'failed' || status === 'expired';
  }

  function canRevokeEnrollment(status: string) {
    return canSuspendEnrollment(status) || status === 'suspended';
  }

  function formatEnrolledAt(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function enrollmentStatusLabel(status: string) {
    const keys: Record<
      string,
      | 'admin.enrollmentActive'
      | 'admin.enrollmentRevoked'
      | 'admin.enrollmentSuspended'
      | 'admin.enrollmentCompleted'
      | 'admin.enrollmentFailed'
      | 'admin.enrollmentExpired'
    > = {
      active: 'admin.enrollmentActive',
      revoked: 'admin.enrollmentRevoked',
      suspended: 'admin.enrollmentSuspended',
      completed: 'admin.enrollmentCompleted',
      failed: 'admin.enrollmentFailed',
      expired: 'admin.enrollmentExpired',
    };
    const key = keys[status];
    return key ? t(key, $locale) : status;
  }

  function assignmentStatusLabel(row: ReportingRow) {
    if (!row.enrollment) return t('admin.reportingNoEnrollment', $locale);
    const status = row.enrollment.status;
    if (status === 'revoked') return t('admin.assignmentRemoved', $locale);
    if (status === 'suspended') return t('admin.enrollmentSuspended', $locale);
    if (status === 'active') return t('admin.enrollmentActive', $locale);
    return enrollmentStatusLabel(status);
  }

  function assignmentStatusClass(row: ReportingRow) {
    if (!row.enrollment) return 'revoked';
    return row.enrollment.status;
  }

  function reportingProgressStateLabel(row: ReportingRow) {
    if (row.progress.progressPercent >= 100 || row.enrollment?.status === 'completed') {
      return t('admin.reportingProgressCompleted', $locale);
    }
    if (row.progress.progressPercent > 0) return t('admin.reportingProgressStarted', $locale);
    return t('admin.reportingProgressNotStarted', $locale);
  }

  function isActiveEnrollment(row: ReportingRow) {
    return row.enrollment?.status === 'active';
  }

  function reportingProgressStateClass(row: ReportingRow) {
    if (row.progress.progressPercent >= 100 || row.enrollment?.status === 'completed') return 'completed';
    if (row.progress.progressPercent > 0) return 'started';
    return 'idle';
  }

  function isCurrentAttemptCompleted(row: ReportingRow) {
    return row.enrollment?.status === 'completed' && row.progress.progressPercent >= 100;
  }

  function currentAttemptCertificate(row: ReportingRow) {
    if (!isCurrentAttemptCompleted(row) || row.completions.length === 0) return null;
    return row.completions[0];
  }

  function historicalCertificates(row: ReportingRow) {
    if (row.completions.length === 0) return [];
    if (isCurrentAttemptCompleted(row)) return row.completions.slice(1);
    return row.completions;
  }

  async function resetStudentProgress(userId: string) {
    if (!confirm(t('admin.reportingResetConfirm', $locale))) return;
    saving = true;
    error = '';
    try {
      await serverMutate('apiMutation', `/api/courses/${courseId}/reporting/${userId}/reset-progress`, 'POST');
      message = t('admin.saved', $locale);
      await refreshCourse();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  function openCertHistory(row: ReportingRow) {
    certHistoryModal = {
      userName: row.user.name,
      completions: historicalCertificates(row),
    };
  }
</script>

<div class="course-edit">
  <div class="course-edit-top">
    <a href="/dashboard/admin/manage" class="course-edit-back">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      {t('admin.backToTree', $locale)}
    </a>
    {#if course}
      <div class="course-edit-heading">
        <h1>{title || slug}</h1>
        <span class="cat-tree-badge" class:cat-tree-badge--live={Boolean(course.isPublished)}>
          {course.isPublished ? t('admin.published', $locale) : t('admin.draft', $locale)}
        </span>
      </div>
      <p class="course-edit-sub">ID: {slug}</p>
    {/if}
  </div>

  {#if message}<div class="admin-flash admin-flash--ok">{message}</div>{/if}
  {#if error}<div class="admin-flash admin-flash--err">{error}</div>{/if}

  {#if loading}
    <p class="loading-text">...</p>
  {:else if !course}
    <p class="empty-state">{t('admin.courseNotFound', $locale)}</p>
  {:else}
    <nav class="course-edit-tabs" aria-label="Course edit">
      <div class="course-edit-tabs-primary">
        <button
          type="button"
          class="course-edit-tab course-edit-tab--primary"
          class:course-edit-tab--active={activeTab === 'content'}
          onclick={() => (activeTab = 'content')}
        >
          {t('admin.tabContent', $locale)}
        </button>
      </div>
      <span class="course-edit-tabs-divider" aria-hidden="true"></span>
      <div class="course-edit-tabs-secondary">
        <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>{t('admin.tabSettings', $locale)}</button>
        <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'evaluation'} onclick={() => (activeTab = 'evaluation')}>{t('admin.tabEvaluation', $locale)}</button>
        <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'students'} onclick={() => (activeTab = 'students')}>{t('admin.tabStudents', $locale)}</button>
        <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'certificate'} onclick={() => (activeTab = 'certificate')}>{t('admin.tabCertificate', $locale)}</button>
        <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'reporting'} onclick={() => (activeTab = 'reporting')}>{t('admin.tabReporting', $locale)}</button>
      </div>
    </nav>

    {#if activeTab === 'settings'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabSettings', $locale)}</h2></div>
        <div class="panel-body">
          <form class="course-edit-form" onsubmit={saveSettings}>
            <div class="cat-tree-field">
              <label for="course-title">{t('admin.courseTitle', $locale)}</label>
              <input id="course-title" bind:value={title} required />
            </div>
            <div class="cat-tree-field">
              <label for="course-id">{t('admin.courseId', $locale)}</label>
              <input id="course-id" bind:value={slug} required />
            </div>
            <div class="cat-tree-field">
              <label for="course-desc">{t('admin.courseDescription', $locale)}</label>
              <textarea id="course-desc" bind:value={description} rows="4"></textarea>
            </div>
            <div class="cat-tree-field">
              <label for="publish-mode">{t('admin.publishMode', $locale)}</label>
              <select id="publish-mode" bind:value={publicationMode}>
                <option value="manual">{t('admin.publishModeManual', $locale)}</option>
                <option value="schedule">{t('admin.publishModeSchedule', $locale)}</option>
              </select>
            </div>

            {#if publicationMode === 'manual'}
              <label class="course-edit-check">
                <input type="checkbox" bind:checked={publishManual} />
                {t('admin.publishManualToggle', $locale)}
              </label>
              <p class="course-edit-hint">{t('admin.publishManualHint', $locale)}</p>
            {:else}
              <div class="cat-tree-field">
                <label for="publish-start">{t('admin.publishStartsAt', $locale)}</label>
                <input id="publish-start" type="datetime-local" bind:value={publishStartsAt} required />
              </div>
              <div class="cat-tree-field">
                <label for="publish-end">{t('admin.publishEndsAt', $locale)}</label>
                <input id="publish-end" type="datetime-local" bind:value={publishEndsAt} />
              </div>
              <p class="course-edit-hint">{t('admin.publishScheduleHint', $locale)}</p>
            {/if}
            <button type="submit" class="btn btn-sm" disabled={saving}>{t('admin.saveChanges', $locale)}</button>
          </form>
        </div>
      </section>
    {:else if activeTab === 'content'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.courseStructure', $locale)}</h2></div>
        <div class="panel-body">
          <CourseActivityEditor
            courseId={courseId}
            modules={modules as never}
            locale={$locale}
            onChange={reloadCourse}
          />
        </div>
      </section>
    {:else if activeTab === 'evaluation'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabEvaluation', $locale)}</h2></div>
        <div class="panel-body">
          <form class="course-edit-form evaluation-form" onsubmit={saveEvaluation}>
            <div class="evaluation-form-intro">
              <p class="course-edit-hint">{t('admin.evaluationHint', $locale)}</p>
              {#if evaluationModules().length > 0}
                <span class="evaluation-summary-badge">
                  {t('admin.evaluationMandatorySummary', $locale).replace(
                    '{count}',
                    String(mandatoryActivityCount()),
                  )}
                </span>
              {/if}
            </div>
            {#if evaluationModules().length === 0}
              <p class="cat-tree-empty">{t('admin.evaluationEmpty', $locale)}</p>
            {:else}
              <div class="evaluation-activity-list">
                {#each evaluationModules() as mod}
                  <section class="evaluation-module-block">
                    <div class="evaluation-module-head">
                      <h3 class="evaluation-module-title">{mod.title as string}</h3>
                      <span class="evaluation-module-count">
                        {mandatoryCountInModule(mod)}/{mod.activities.length}
                        {t('admin.evaluationModuleMandatory', $locale)}
                      </span>
                    </div>
                    <ul class="evaluation-activity-rows">
                      {#each mod.activities as activity}
                        {@const activityId = activity.id as string}
                        {@const isMandatory = mandatoryByActivityId[activityId] ?? false}
                        <li class="evaluation-activity-row" class:evaluation-activity-row--on={isMandatory}>
                          <div class="evaluation-activity-main">
                            <span class="evaluation-activity-type">{activityTypeLabel(activity.type as string)}</span>
                            <span class="evaluation-activity-name">{activity.title as string}</span>
                          </div>
                          <label class="evaluation-switch-row">
                            <span class="evaluation-switch-text">
                              {isMandatory
                                ? t('admin.evaluationMandatoryOn', $locale)
                                : t('admin.evaluationMandatoryOff', $locale)}
                            </span>
                            <span class="evaluation-switch">
                              <input
                                type="checkbox"
                                checked={isMandatory}
                                onchange={(e) => setMandatory(activityId, e.currentTarget.checked)}
                              />
                              <span class="evaluation-switch-slider" aria-hidden="true"></span>
                            </span>
                          </label>
                        </li>
                      {/each}
                    </ul>
                  </section>
                {/each}
              </div>
            {/if}
            <div class="evaluation-form-actions">
              <button type="submit" class="btn btn-sm" disabled={saving || evaluationModules().length === 0}>
                {t('admin.saveChanges', $locale)}
              </button>
            </div>
          </form>
        </div>
      </section>
    {:else if activeTab === 'students'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabStudents', $locale)}</h2></div>
        <div class="panel-body">
          <div class="course-edit-enroll-row">
            <StudentSearchPicker
              bind:this={studentSearch}
              excludeIds={assignedUserIds}
              disabled={saving}
              onSelect={(user) => {
                enrollUserId = user?.id ?? '';
              }}
            />
            <button type="button" class="btn btn-sm" disabled={saving || !enrollUserId} onclick={addEnrollment}>{t('admin.assign', $locale)}</button>
          </div>

          <p class="course-edit-hint">{t('admin.studentsTabHint', $locale)}</p>

          {#if assignedEnrollments.length === 0}
            <p class="cat-tree-empty">{t('admin.noEnrollments', $locale)}</p>
          {:else}
            <div class="users-table-wrap course-edit-table">
              <table class="users-table">
                <thead>
                  <tr>
                    <th>{t('admin.studentName', $locale)}</th>
                    <th>E-mail</th>
                    <th>{t('admin.enrolledAt', $locale)}</th>
                    <th>{t('admin.enrollmentStatus', $locale)}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each assignedEnrollments as row}
                    <tr>
                      <td>{row.user.name}</td>
                      <td>{row.user.email}</td>
                      <td>{formatEnrolledAt(row.enrollment.enrolledAt)}</td>
                      <td>
                        <span class="users-role-badge enrollment-status--{row.enrollment.status}">
                          {enrollmentStatusLabel(row.enrollment.status)}
                        </span>
                      </td>
                      <td>
                        <div class="enrollment-actions">
                          {#if row.enrollment.status === 'suspended'}
                            <button
                              type="button"
                              class="btn btn-sm"
                              disabled={saving}
                              onclick={() => unsuspendEnrollment(row.enrollment.id)}
                            >
                              {t('admin.unsuspendEnrollment', $locale)}
                            </button>
                          {:else if canSuspendEnrollment(row.enrollment.status)}
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              disabled={saving}
                              onclick={() => suspendEnrollment(row.enrollment.id)}
                            >
                              {t('admin.suspendEnrollment', $locale)}
                            </button>
                          {/if}
                          {#if canRevokeEnrollment(row.enrollment.status)}
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              disabled={saving}
                              onclick={() => revokeEnrollment(row.enrollment.id)}
                            >
                              {t('admin.revokeEnrollment', $locale)}
                            </button>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {:else if activeTab === 'certificate'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabCertificate', $locale)}</h2></div>
        <div class="panel-body">
          <form class="course-edit-form" onsubmit={saveCertificate}>
            <label class="course-edit-check">
              <input type="checkbox" bind:checked={certEnabled} />
              {t('admin.certEnabled', $locale)}
            </label>
            <div class="cat-tree-field">
              <label for="cert-title">{t('admin.certTitleTemplate', $locale)}</label>
              <input id="cert-title" bind:value={certTitle} placeholder={title} />
            </div>
            <button type="submit" class="btn btn-sm" disabled={saving}>{t('admin.saveChanges', $locale)}</button>
          </form>

          <h3 class="course-edit-section-title">{t('admin.issuedCertificates', $locale)}</h3>
          {#if issuedCerts.length === 0}
            <p class="cat-tree-empty">{t('admin.noCertificates', $locale)}</p>
          {:else}
            <div class="users-table-wrap course-edit-table">
              <table class="users-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('admin.studentName', $locale)}</th>
                    <th>{t('admin.usersCreated', $locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each issuedCerts as cert}
                    <tr>
                      <td>{cert.certificateNumber}</td>
                      <td>{cert.userName}<br /><span class="course-edit-sub">{cert.userEmail}</span></td>
                      <td>{new Date(cert.issuedAt).toLocaleDateString($locale)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {:else}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabReporting', $locale)}</h2></div>
        <div class="panel-body">
          <p class="course-edit-hint">{t('admin.reportingHint', $locale)}</p>
          {#if reportingRows.length === 0}
            <p class="cat-tree-empty">{t('admin.reportingEmpty', $locale)}</p>
          {:else}
            <div class="users-table-wrap course-edit-table reporting-table-wrap">
              <table class="users-table reporting-table">
                <colgroup>
                  <col class="reporting-col-name" />
                  <col class="reporting-col-assignment" />
                  <col class="reporting-col-progress" />
                  <col class="reporting-col-evaluation" />
                  <col class="reporting-col-certs" />
                  <col class="reporting-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="reporting-col-name" title={t('admin.studentName', $locale)}>{t('admin.reportingColName', $locale)}</th>
                    <th class="reporting-col-assignment" title={t('admin.reportingAssignmentStatus', $locale)}>{t('admin.reportingColAssignment', $locale)}</th>
                    <th class="reporting-col-progress" title={t('course.progress', $locale)}>{t('admin.reportingColProgress', $locale)}</th>
                    <th class="reporting-col-evaluation" title={t('admin.reportingProgressEvaluation', $locale)}>{t('admin.reportingColEvaluation', $locale)}</th>
                    <th class="reporting-col-certs" title={t('admin.issuedCertificates', $locale)}>{t('admin.reportingColCerts', $locale)}</th>
                    <th class="reporting-col-actions">{t('admin.reportingColActions', $locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each reportingRows as row}
                    <tr>
                      <td class="reporting-col-name">
                        {row.user.name}<br />
                        <span class="course-edit-sub">{row.user.email}</span>
                      </td>
                      <td class="reporting-col-assignment">
                        <span class="users-role-badge enrollment-status--{assignmentStatusClass(row)}">
                          {assignmentStatusLabel(row)}
                        </span>
                      </td>
                      <td class="reporting-col-progress">
                        <div class="reporting-progress-cell">
                          {#if isActiveEnrollment(row)}
                            <div class="progress-bar">
                              <div class="progress-bar-fill" style="width: {row.progress.progressPercent}%"></div>
                            </div>
                            <span>{row.progress.completedActivities}/{row.progress.totalActivities} ({row.progress.progressPercent}%)</span>
                          {:else}
                            <div class="progress-bar reporting-progress-cell--frozen">
                              <div class="progress-bar-fill" style="width: {row.progress.progressPercent}%"></div>
                            </div>
                            <span title={t('admin.reportingProgressFrozen', $locale)}>
                              {t('admin.reportingProgressFrozenShort', $locale)}
                            </span>
                          {/if}
                        </div>
                      </td>
                      <td class="reporting-col-evaluation">
                        <span class="users-role-badge reporting-progress-badge reporting-state--{reportingProgressStateClass(row)}">
                          {reportingProgressStateLabel(row)}
                        </span>
                      </td>
                      <td class="reporting-col-certs">
                        <div class="reporting-cert-list">
                          <div class="reporting-cert-inline">
                            {#if currentAttemptCertificate(row)}
                              <span class="reporting-cert-current">
                                #{currentAttemptCertificate(row)?.certificateNumber} · {new Date(currentAttemptCertificate(row)?.issuedAt as string).toLocaleDateString($locale)}
                              </span>
                            {:else}
                              <span class="course-edit-sub reporting-cert-empty">—</span>
                            {/if}
                            {#if historicalCertificates(row).length > 0}
                              <button
                                type="button"
                                class="reporting-cert-history-btn"
                                title="{t('admin.reportingOlderCertificates', $locale)} ({historicalCertificates(row).length})"
                                aria-label="{t('admin.reportingOlderCertificates', $locale)} ({historicalCertificates(row).length})"
                                onclick={() => openCertHistory(row)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
                                  <path d="M6 11v4.5c0 1.8 2.7 3 6 3s6-1.2 6-3V11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
                                  <path d="M22 8v5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
                                </svg>
                                <span class="reporting-cert-history-count">{historicalCertificates(row).length}</span>
                              </button>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td class="reporting-col-actions">
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm reporting-reset-btn"
                          disabled={saving || !row.enrollment}
                          title={t('admin.reportingResetProgress', $locale)}
                          onclick={() => resetStudentProgress(row.user.id)}
                        >
                          {t('admin.reportingResetProgressShort', $locale)}
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</div>

{#if certHistoryModal}
  <div class="reporting-modal-overlay" role="presentation" onclick={() => (certHistoryModal = null)}>
    <div class="reporting-modal" role="dialog" aria-modal="true" aria-label={t('admin.reportingCertificateHistory', $locale)} onclick={(e) => e.stopPropagation()}>
      <div class="reporting-modal-head">
        <h3>{t('admin.reportingCertificateHistory', $locale)} — {certHistoryModal.userName}</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (certHistoryModal = null)}>{t('admin.cancel', $locale)}</button>
      </div>
      <div class="reporting-modal-list">
        {#each certHistoryModal.completions as completion}
          <div class="reporting-modal-row">
            <span>#{completion.certificateNumber}</span>
            <span>{new Date(completion.issuedAt).toLocaleDateString($locale)}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

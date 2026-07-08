<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import StudentSearchPicker from '$lib/components/StudentSearchPicker.svelte';
  import CourseActivityEditor from '$lib/components/CourseActivityEditor.svelte';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-users.css';
  import '$lib/styles/course-edit.css';

  type Tab = 'settings' | 'content' | 'evaluation' | 'students' | 'certificate';

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

  const courseId = $derived($page.params.id);
  let activeTab = $state<Tab>('content');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  let course = $state<Record<string, unknown> | null>(null);
  let title = $state('');
  let slug = $state('');
  let description = $state('');
  let publicationMode = $state<'manual' | 'schedule'>('manual');
  let publishManual = $state(false);
  let publishStartsAt = $state('');
  let publishEndsAt = $state('');

  let evalRules = $state<CompletionRule[]>([]);
  let minQuizScore = $state(70);
  let videoWatchPercent = $state(80);

  let enrollments = $state<EnrollmentRow[]>([]);
  let enrollUserId = $state('');
  let studentSearch = $state<{ reset: () => void } | null>(null);

  let certEnabled = $state(false);
  let certTitle = $state('');
  let issuedCerts = $state<CertRow[]>([]);

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
      else void loadAll();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  function parseRules(rules: CompletionRule[]) {
    const evalOnly = rules.filter((r) => !(r.config as { certificate?: unknown })?.certificate);
    const certRule = rules.find((r) => (r.config as { certificate?: unknown })?.certificate) as
      | CompletionRule
      | undefined;
    evalRules = evalOnly.length
      ? evalOnly
      : [{ type: 'all_lessons_complete', config: {}, isRequired: true }];
    const quiz = evalOnly.find((r) => r.type === 'quiz_min_score');
    if (quiz?.config && typeof quiz.config.minScore === 'number') minQuizScore = quiz.config.minScore as number;
    const video = evalOnly.find((r) => r.type === 'video_watch_percent');
    if (video?.config && typeof video.config.percent === 'number')
      videoWatchPercent = video.config.percent as number;
    const cert = (certRule?.config as { certificate?: { enabled?: boolean; titleTemplate?: string } })
      ?.certificate;
    certEnabled = cert?.enabled ?? false;
    certTitle = cert?.titleTemplate ?? '';
  }

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [c, enr, certs] = await Promise.all([
        api.getCourse(courseId),
        api.getEnrollments(courseId) as Promise<EnrollmentRow[]>,
        api.getCourseCertificates(courseId),
      ]);
      course = c;
      title = String(c.title ?? '');
      slug = String(c.slug ?? '');
      description = String(c.description ?? '');
      publishManual = Boolean(c.isPublished);
      publishStartsAt = toLocalDateTimeInput(c.startsAt);
      publishEndsAt = toLocalDateTimeInput(c.endsAt);
      publicationMode = publishStartsAt || publishEndsAt ? 'schedule' : 'manual';
      parseRules((c.completionRules as CompletionRule[]) ?? []);
      enrollments = enr;
      issuedCerts = certs;
    } catch (e) {
      error = (e as Error).message;
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

      await api.updateCourseContent(courseId, {
        title: title.trim(),
        description,
        slug: slug.trim(),
        isPublished: publicationMode === 'schedule' ? true : publishManual,
        startsAt,
        endsAt,
        locale: $locale,
      });
      message = t('admin.saved', $locale);
      await loadAll();
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
      const rules: CompletionRule[] = [
        { type: 'all_lessons_complete', config: {}, isRequired: true },
        { type: 'quiz_min_score', config: { minScore: minQuizScore }, isRequired: true },
        { type: 'video_watch_percent', config: { percent: videoWatchPercent }, isRequired: false },
      ];
      await api.updateCompletionRules(courseId, {
        rules,
        certificate: certEnabled ? { enabled: true, titleTemplate: certTitle.trim() } : undefined,
      });
      message = t('admin.saved', $locale);
      await loadAll();
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
      await api.updateCompletionRules(courseId, {
        rules: rules.length ? rules : [{ type: 'all_lessons_complete', config: {}, isRequired: true }],
        certificate: {
          enabled: certEnabled,
          titleTemplate: certTitle.trim() || title,
        },
      });
      message = t('admin.saved', $locale);
      await loadAll();
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
      await api.createEnrollment(enrollUserId, courseId);
      enrollUserId = '';
      studentSearch?.reset();
      message = t('admin.enrolled', $locale);
      enrollments = (await api.getEnrollments(courseId)) as EnrollmentRow[];
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
      await api.createEnrollment(userId, courseId);
      enrollments = (await api.getEnrollments(courseId)) as EnrollmentRow[];
      message = t('admin.enrolled', $locale);
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
      await api.revokeEnrollment(id);
      enrollments = (await api.getEnrollments(courseId)) as EnrollmentRow[];
      message = t('admin.saved', $locale);
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
      await api.deleteEnrollmentPermanently(id);
      enrollments = (await api.getEnrollments(courseId)) as EnrollmentRow[];
      message = t('admin.saved', $locale);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function reloadCourse() {
    course = await api.getCourse(courseId);
  }

  const modules = $derived((course?.modules as Array<Record<string, unknown>>) ?? []);

  const activeEnrolledIds = $derived(
    enrollments.filter((r) => r.enrollment.status === 'active').map((r) => r.user.id),
  );

  function formatEnrolledAt(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function enrollmentStatusLabel(status: string) {
    const keys: Record<string, 'admin.enrollmentActive' | 'admin.enrollmentRevoked' | 'admin.enrollmentCompleted' | 'admin.enrollmentFailed' | 'admin.enrollmentExpired'> = {
      active: 'admin.enrollmentActive',
      revoked: 'admin.enrollmentRevoked',
      completed: 'admin.enrollmentCompleted',
      failed: 'admin.enrollmentFailed',
      expired: 'admin.enrollmentExpired',
    };
    const key = keys[status];
    return key ? t(key, $locale) : status;
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
          <form class="course-edit-form" onsubmit={saveEvaluation}>
            <p class="course-edit-hint">{t('admin.evaluationHint', $locale)}</p>
            <div class="cat-tree-field">
              <label for="quiz-score">{t('admin.minQuizScore', $locale)}</label>
              <input id="quiz-score" type="number" min="0" max="100" bind:value={minQuizScore} />
            </div>
            <div class="cat-tree-field">
              <label for="video-pct">{t('admin.videoWatchPercent', $locale)}</label>
              <input id="video-pct" type="number" min="0" max="100" bind:value={videoWatchPercent} />
            </div>
            <button type="submit" class="btn btn-sm" disabled={saving}>{t('admin.saveChanges', $locale)}</button>
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
              excludeIds={activeEnrolledIds}
              disabled={saving}
              onSelect={(user) => {
                enrollUserId = user?.id ?? '';
              }}
            />
            <button type="button" class="btn btn-sm" disabled={saving || !enrollUserId} onclick={addEnrollment}>{t('admin.assign', $locale)}</button>
          </div>

          {#if enrollments.length === 0}
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
                  {#each enrollments as row}
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
                        {#if row.enrollment.status === 'active'}
                          <button type="button" class="btn btn-ghost btn-sm" disabled={saving} onclick={() => revokeEnrollment(row.enrollment.id)}>{t('admin.revokeEnrollment', $locale)}</button>
                        {:else if row.enrollment.status === 'revoked'}
                          <button type="button" class="btn btn-sm" disabled={saving} onclick={() => restoreEnrollment(row.user.id)}>{t('admin.restoreEnrollment', $locale)}</button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            disabled={saving}
                            onclick={() => deleteEnrollmentPermanently(row.enrollment.id)}
                          >
                            {t('admin.deleteEnrollment', $locale)}
                          </button>
                        {/if}
                      </td>
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
    {/if}
  {/if}
</div>

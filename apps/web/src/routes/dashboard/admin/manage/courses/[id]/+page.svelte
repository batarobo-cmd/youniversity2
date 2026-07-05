<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import StudentSearchPicker from '$lib/components/StudentSearchPicker.svelte';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-users.css';
  import '$lib/styles/course-edit.css';

  type Tab = 'content' | 'evaluation' | 'students' | 'certificate';

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

  let evalRules = $state<CompletionRule[]>([]);
  let minQuizScore = $state(70);
  let videoWatchPercent = $state(80);

  let enrollments = $state<EnrollmentRow[]>([]);
  let enrollUserId = $state('');
  let studentSearch = $state<{ reset: () => void } | null>(null);

  let certEnabled = $state(false);
  let certTitle = $state('');
  let issuedCerts = $state<CertRow[]>([]);

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
      parseRules((c.completionRules as CompletionRule[]) ?? []);
      enrollments = enr;
      issuedCerts = certs;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function saveContent(e: Event) {
    e.preventDefault();
    saving = true;
    message = '';
    error = '';
    try {
      await api.updateCourseContent(courseId, {
        title: title.trim(),
        description,
        slug: slug.trim(),
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
      <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'content'} onclick={() => (activeTab = 'content')}>{t('admin.tabContent', $locale)}</button>
      <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'evaluation'} onclick={() => (activeTab = 'evaluation')}>{t('admin.tabEvaluation', $locale)}</button>
      <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'students'} onclick={() => (activeTab = 'students')}>{t('admin.tabStudents', $locale)}</button>
      <button type="button" class="course-edit-tab" class:course-edit-tab--active={activeTab === 'certificate'} onclick={() => (activeTab = 'certificate')}>{t('admin.tabCertificate', $locale)}</button>
    </nav>

    {#if activeTab === 'content'}
      <section class="panel course-edit-panel">
        <div class="panel-header"><h2>{t('admin.tabContent', $locale)}</h2></div>
        <div class="panel-body">
          <form class="course-edit-form" onsubmit={saveContent}>
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

            <h3 class="course-edit-section-title">{t('admin.courseStructure', $locale)}</h3>
            {#if modules.length === 0}
              <p class="cat-tree-empty">{t('admin.noModules', $locale)}</p>
            {:else}
              <ul class="course-edit-modules">
                {#each modules as mod}
                  <li>
                    <strong>{mod.title}</strong>
                    <span>{((mod.lessons as unknown[]) ?? []).length} {t('course.lessons', $locale).toLowerCase()}</span>
                  </li>
                {/each}
              </ul>
            {/if}

            <button type="submit" class="btn btn-sm" disabled={saving}>{t('admin.saveChanges', $locale)}</button>
          </form>
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

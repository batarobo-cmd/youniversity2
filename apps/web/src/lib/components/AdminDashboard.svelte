<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import AdminHistoryModal from '$lib/components/AdminHistoryModal.svelte';
  import CoursePublicationBadge from '$lib/components/CoursePublicationBadge.svelte';
  import '$lib/styles/dashboard.css';

  interface Props {
    data: Record<string, unknown>;
  }

  let { data }: Props = $props();

  let historyKind = $state<'registrations' | 'logins' | null>(null);

  const stats = $derived(data.stats as Record<string, number>);
  const courses = $derived((data.courses as Array<Record<string, unknown>>) ?? []);
  const recentRegistrations = $derived((data.recentRegistrations as Array<Record<string, unknown>>) ?? []);
  const recentLogins = $derived((data.recentLogins as Array<Record<string, unknown>>) ?? []);

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function loginMethodLabel(method: string) {
    const keys: Record<string, 'dash.loginMethodPassword' | 'dash.loginMethodGoogle' | 'dash.loginMethodMicrosoft'> = {
      password: 'dash.loginMethodPassword',
      oauth_google: 'dash.loginMethodGoogle',
      oauth_microsoft: 'dash.loginMethodMicrosoft',
    };
    const key = keys[method];
    return key ? t(key, $locale) : method;
  }
</script>

<div class="dashboard-welcome">
  <h1>{t('dash.welcomeAdmin', $locale)}</h1>
  <p>{t('dash.welcomeAdminSub', $locale)}</p>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-card-value">{stats.totalCourses}</div>
    <div class="stat-card-label">{t('dash.totalCourses', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.publishedCourses}</div>
    <div class="stat-card-label">{t('dash.published', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.scheduledCourses ?? 0}</div>
    <div class="stat-card-label">{t('dash.scheduled', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.totalStudents}</div>
    <div class="stat-card-label">{t('dash.students', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.activeEnrollments}</div>
    <div class="stat-card-label">{t('dash.activeEnrollments', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.completedEnrollments}</div>
    <div class="stat-card-label">{t('dash.completedEnrollments', $locale)}</div>
  </div>
</div>

<div class="dashboard-admin-main">
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{t('dash.courseOverviewActive', $locale)}</h2>
        <p class="panel-header-sub">{t('dash.courseOverviewActiveSub', $locale)}</p>
      </div>
    </div>
    <div class="panel-body" style="padding: 0;">
      {#if courses.length === 0}
        <div class="empty-state">{t('dash.noActiveCoursesLastHour', $locale)}</div>
      {:else}
        <table class="admin-table">
          <thead>
            <tr>
              <th>{t('dash.courseName', $locale)}</th>
              <th>{t('dash.activityLastHour', $locale)}</th>
              <th>{t('dash.activeUsersLastHour', $locale)}</th>
              <th>{t('dash.status', $locale)}</th>
            </tr>
          </thead>
          <tbody>
            {#each courses as course}
              <tr>
                <td><a href="/courses/{course.id}">{course.title as string}</a></td>
                <td>{course.activityCount as number}</td>
                <td>{course.activeUsers as number}</td>
                <td>
                  <CoursePublicationBadge
                    variant="badge"
                    course={{
                      isPublished: Boolean(course.isPublished),
                      startsAt: course.startsAt as string | null | undefined,
                      endsAt: course.endsAt as string | null | undefined,
                    }}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <section class="panel">
    <div class="panel-header">
      <h2>{t('dash.recentRegistrations', $locale)}</h2>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (historyKind = 'registrations')}>
        {t('dash.viewHistory', $locale)}
      </button>
    </div>
    <div class="panel-body" style="padding: 0;">
      {#if recentRegistrations.length === 0}
        <div class="empty-state">{t('dash.noRegistrations', $locale)}</div>
      {:else}
        <table class="admin-table">
          <thead>
            <tr>
              <th>{t('auth.name', $locale)}</th>
              <th>{t('auth.email', $locale)}</th>
              <th>{t('dash.registeredAt', $locale)}</th>
            </tr>
          </thead>
          <tbody>
            {#each recentRegistrations as reg}
              <tr>
                <td>{reg.userName as string}</td>
                <td>{reg.userEmail as string}</td>
                <td>{formatDateTime(reg.registeredAt as string)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>

  <section class="panel">
    <div class="panel-header">
      <h2>{t('dash.recentLogins', $locale)}</h2>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (historyKind = 'logins')}>
        {t('dash.viewHistory', $locale)}
      </button>
    </div>
    <div class="panel-body" style="padding: 0;">
      {#if recentLogins.length === 0}
        <div class="empty-state">{t('dash.noLogins', $locale)}</div>
      {:else}
        <table class="admin-table">
          <thead>
            <tr>
              <th>{t('auth.name', $locale)}</th>
              <th>{t('auth.email', $locale)}</th>
              <th>{t('dash.loggedInAt', $locale)}</th>
              <th>{t('dash.loginMethod', $locale)}</th>
            </tr>
          </thead>
          <tbody>
            {#each recentLogins as login}
              <tr>
                <td>{login.userName as string}</td>
                <td>{login.userEmail as string}</td>
                <td>{formatDateTime(login.loggedInAt as string)}</td>
                <td>{loginMethodLabel(login.method as string)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>
</div>

{#if historyKind}
  <AdminHistoryModal kind={historyKind} open={true} onClose={() => (historyKind = null)} />
{/if}

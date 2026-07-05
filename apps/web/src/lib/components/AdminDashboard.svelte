<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { activityFeed, wsStatus } from '$lib/stores/realtime';
  import '$lib/styles/dashboard.css';

  interface Props {
    data: Record<string, unknown>;
  }

  let { data }: Props = $props();

  const stats = $derived(data.stats as Record<string, number>);
  const courses = $derived((data.courses as Array<Record<string, unknown>>) ?? []);
  const recentEnrollments = $derived((data.recentEnrollments as Array<Record<string, unknown>>) ?? []);
  const recentActivity = $derived((data.recentActivity as Array<Record<string, unknown>>) ?? []);
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

<div class="dashboard-grid">
  <div class="dashboard-main-col">
    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.courseOverview', $locale)}</h2>
      </div>
      <div class="panel-body" style="padding: 0;">
        {#if courses.length === 0}
          <div class="empty-state">{t('dash.noCourses', $locale)}</div>
        {:else}
          <table class="admin-table">
            <thead>
              <tr>
                <th>{t('dash.courseName', $locale)}</th>
                <th>{t('dash.enrollments', $locale)}</th>
                <th>{t('dash.status', $locale)}</th>
              </tr>
            </thead>
            <tbody>
              {#each courses as course}
                <tr>
                  <td><a href="/courses/{course.id}">{course.title as string}</a></td>
                  <td>{course.enrollmentCount as number}</td>
                  <td>
                    {#if course.isPublished}
                      <span class="badge badge-success">{t('dash.published', $locale)}</span>
                    {:else}
                      <span class="badge badge-warning">Draft</span>
                    {/if}
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
        <h2>{t('dash.recentEnrollments', $locale)}</h2>
      </div>
      <div class="panel-body" style="padding: 0;">
        {#if recentEnrollments.length === 0}
          <div class="empty-state">{t('dash.noEnrollments', $locale)}</div>
        {:else}
          <table class="admin-table">
            <thead>
              <tr>
                <th>{t('auth.name', $locale)}</th>
                <th>{t('auth.email', $locale)}</th>
                <th>{t('dash.status', $locale)}</th>
              </tr>
            </thead>
            <tbody>
              {#each recentEnrollments as enr}
                <tr>
                  <td>{enr.userName as string}</td>
                  <td>{enr.userEmail as string}</td>
                  <td><span class="badge badge-warning">{enr.status as string}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>
  </div>

  <div class="dashboard-side-col">
    <section class="panel">
      <div class="panel-header">
        <h2>{t('admin.activity', $locale)}</h2>
        <span class="badge {$wsStatus === 'connected' ? 'badge-success' : 'badge-danger'}">
          {$wsStatus === 'connected' ? '🟢' : '🔴'}
        </span>
      </div>
      <div class="panel-body">
        {#each $activityFeed as item}
          <div class="activity-item">
            <span class="activity-time">{item.time}</span>
            <span><strong>{item.userName}</strong> — {item.eventType}</span>
          </div>
        {/each}
        {#each recentActivity as act}
          <div class="activity-item" style="opacity: 0.7;">
            <span class="activity-time">{new Date(act.createdAt as string).toLocaleTimeString()}</span>
            <span><strong>{act.userName as string}</strong> — {act.eventType as string}</span>
          </div>
        {/each}
        {#if $activityFeed.length === 0 && recentActivity.length === 0}
          <div class="empty-state">{t('dash.noActivity', $locale)}</div>
        {/if}
      </div>
    </section>
  </div>
</div>

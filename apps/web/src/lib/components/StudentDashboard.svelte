<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import CalendarWidget from './CalendarWidget.svelte';
  import '$lib/styles/dashboard.css';

  interface Props {
    data: Record<string, unknown>;
  }

  let { data }: Props = $props();

  const stats = $derived(data.stats as Record<string, number>);
  const activeCourses = $derived((data.activeCourses as Array<Record<string, unknown>>) ?? []);
  const completedCourses = $derived((data.completedCourses as Array<Record<string, unknown>>) ?? []);
  const calendarEvents = $derived((data.calendarEvents as Array<Record<string, unknown>>) ?? []);
  const upcomingDeadlines = $derived((data.upcomingDeadlines as Array<Record<string, unknown>>) ?? []);
  const recentActivity = $derived((data.recentActivity as Array<Record<string, unknown>>) ?? []);
</script>

<div class="dashboard-welcome">
  <h1>{t('dash.welcomeStudent', $locale)}</h1>
  <p>{t('dash.welcomeStudentSub', $locale)}</p>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-card-value">{stats.active}</div>
    <div class="stat-card-label">{t('dash.activeCourses', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.completed}</div>
    <div class="stat-card-label">{t('dash.completedCourses', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.certificates}</div>
    <div class="stat-card-label">{t('dash.certificates', $locale)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-value">{stats.avgProgress}%</div>
    <div class="stat-card-label">{t('dash.avgProgress', $locale)}</div>
  </div>
</div>

<div class="dashboard-grid">
  <div class="dashboard-main-col">
    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.activeCourses', $locale)}</h2>
      </div>
      <div class="panel-body">
        {#if activeCourses.length === 0}
          <div class="empty-state">{t('dash.noActiveCourses', $locale)}</div>
        {:else}
          {#each activeCourses as course}
            <div class="course-card">
              <div class="course-card-info">
                <h3><a href="/courses/{course.id}">{course.title as string}</a></h3>
                <p>{course.description as string}</p>
                <div class="progress-bar-wrap">
                  <div class="progress-bar-label">
                    <span>{t('course.progress', $locale)}</span>
                    <span>{course.progressPercent as number}%</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: {course.progressPercent}%"></div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.completedWithCerts', $locale)}</h2>
      </div>
      <div class="panel-body">
        {#if completedCourses.length === 0}
          <div class="empty-state">{t('dash.noCompletedCourses', $locale)}</div>
        {:else}
          {#each completedCourses as course}
            <div class="course-card">
              <div class="course-card-info">
                <h3><a href="/courses/{course.id}">{course.title as string}</a></h3>
                {#if course.certificate}
                  {@const cert = course.certificate as Record<string, string>}
                  <span class="cert-badge">🏆 {cert.certificateNumber}</span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>

  <div class="dashboard-side-col">
    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.calendar', $locale)}</h2>
      </div>
      <div class="panel-body">
        <CalendarWidget events={calendarEvents as Parameters<typeof CalendarWidget>[0]['events']} />
      </div>
    </section>

    {#if upcomingDeadlines.length > 0}
      <section class="panel">
        <div class="panel-header">
          <h2>{t('dash.upcomingDeadlines', $locale)}</h2>
        </div>
        <div class="panel-body">
          {#each upcomingDeadlines as dl}
            <div class="deadline-item">
              <div class="deadline-days">{dl.daysLeft as number}d</div>
              <div>
                <div style="font-weight: 500;">{dl.title as string}</div>
                <div style="font-size: 0.75rem; color: var(--color-muted);">{t('dash.deadline', $locale)}</div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.recentActivity', $locale)}</h2>
      </div>
      <div class="panel-body">
        {#if recentActivity.length === 0}
          <div class="empty-state">{t('dash.noActivity', $locale)}</div>
        {:else}
          {#each recentActivity as act}
            <div class="activity-item">
              <span class="activity-time">{new Date(act.createdAt as string).toLocaleTimeString()}</span>
              <span>{act.eventType as string}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import StudentCourseCard from './StudentCourseCard.svelte';
  import StudentCompletedCourseTile from './StudentCompletedCourseTile.svelte';
  import CalendarWidget from './CalendarWidget.svelte';
  import { certificateDownloadFileName, certificateDownloadUrl, formatCertificateIssuedAt } from '$lib/certificate-download';
  import ViewportPaginator from '$lib/components/ViewportPaginator.svelte';
  import '$lib/styles/dashboard.css';

  interface Props {
    data: Record<string, unknown>;
  }

  let { data }: Props = $props();

  type CertificateItem = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
  };

  const stats = $derived(data.stats as Record<string, number>);
  const activeCourses = $derived((data.activeCourses as Array<Record<string, unknown>>) ?? []);
  const completedLastYear = $derived((data.completedLastYear as Array<Record<string, unknown>>) ?? []);
  const calendarEvents = $derived((data.calendarEvents as Array<Record<string, unknown>>) ?? []);
  const calendarPeriods = $derived((data.calendarPeriods as Array<Record<string, unknown>>) ?? []);
  const upcomingDeadlines = $derived((data.upcomingDeadlines as Array<Record<string, unknown>>) ?? []);

  let certHistoryModal = $state<{ courseTitle: string; certificates: CertificateItem[] } | null>(null);
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 720);

  const certModalListHeight = $derived(Math.max(160, viewportHeight * 0.85 - 180));

  function openCertHistory(courseTitle: string, certificates: CertificateItem[]) {
    certHistoryModal = { courseTitle, certificates };
  }
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
    <div class="stat-card-value">{completedLastYear.length}</div>
    <div class="stat-card-label">{t('dash.completedLastYear', $locale)}</div>
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
        <h2>{t('dash.activeCoursesRunning', $locale)}</h2>
      </div>
      <div class="panel-body">
        {#if activeCourses.length === 0}
          <div class="empty-state">{t('dash.noActiveCourses', $locale)}</div>
        {:else}
          <div class="student-courses-list">
            {#each activeCourses as course (course.id)}
              <StudentCourseCard {course} variant="active" />
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>{t('dash.completedLastYear', $locale)}</h2>
      </div>
      <div class="panel-body">
        {#if completedLastYear.length === 0}
          <div class="empty-state">{t('dash.noCompletedLastYear', $locale)}</div>
        {:else}
          <div class="completed-courses-grid">
            {#each completedLastYear as course (course.id)}
              <StudentCompletedCourseTile {course} onOpenHistory={openCertHistory} />
            {/each}
          </div>
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
        <CalendarWidget
          events={calendarEvents as Parameters<typeof CalendarWidget>[0]['events']}
          periods={calendarPeriods as Parameters<typeof CalendarWidget>[0]['periods']}
        />
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
  </div>
</div>

<svelte:window
  onresize={() => {
    viewportHeight = window.innerHeight;
  }}
/>

{#if certHistoryModal}
  <div class="dash-cert-modal-overlay" role="presentation" onclick={() => (certHistoryModal = null)}>
    <div
      class="dash-cert-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('dash.certificateHistory', $locale)}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="dash-cert-modal-head">
        <h3>{t('dash.certificateHistory', $locale)} — {certHistoryModal.courseTitle}</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (certHistoryModal = null)}>
          {t('admin.cancel', $locale)}
        </button>
      </div>
      <ViewportPaginator
        items={certHistoryModal.certificates}
        availableHeight={certModalListHeight}
        rowHeight={52}
        minPageSize={3}
      >
        {#snippet children(pageItems)}
          <div class="dash-cert-modal-list">
            {#each pageItems as cert}
              <div class="dash-cert-modal-row">
                <span>#{cert.certificateNumber}</span>
                <span>{formatCertificateIssuedAt(cert.issuedAt, $locale)}</span>
                <a
                  class="btn btn-ghost btn-sm"
                  href={certificateDownloadUrl(cert.id)}
                  download={certificateDownloadFileName(cert.certificateNumber)}
                >
                  {t('dash.downloadCertificate', $locale)}
                </a>
              </div>
            {/each}
          </div>
        {/snippet}
      </ViewportPaginator>
    </div>
  </div>
{/if}

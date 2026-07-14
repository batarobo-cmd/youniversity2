<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { isAuthenticated, showStaffNav, locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { lastMessage } from '$lib/stores/realtime';
  import { shouldRefreshDashboard } from '$lib/live-dashboard';
  import { user as authUser } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import StudentCourseCard from '$lib/components/StudentCourseCard.svelte';
  import StudentCompletedCourseTile from '$lib/components/StudentCompletedCourseTile.svelte';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import CertHistoryModal from '$lib/components/CertHistoryModal.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/courses.css';
  import '$lib/styles/dashboard.css';

  type CourseItem = Record<string, unknown>;

  type CertificateItem = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
  };

  let { data }: { data: PageData } = $props();

  const futureCourses = $derived(data.overview.futureCourses as CourseItem[]);
  const pastCourses = $derived(data.overview.pastCourses as CourseItem[]);
  const completedCourses = $derived(
    pastCourses
      .filter((course) => isCompletedCourse(course))
      .sort((a, b) => completionSortKey(b) - completionSortKey(a)),
  );
  let loading = $state(false);
  let certHistoryModal = $state<{ courseTitle: string; certificates: CertificateItem[] } | null>(null);
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 720);

  const certModalListHeight = $derived(Math.max(160, viewportHeight * 0.85 - 180));

  function isCompletedCourse(course: CourseItem) {
    const certificates = (course.certificates as CertificateItem[] | undefined) ?? [];
    return (
      course.enrollmentStatus === 'completed' ||
      certificates.length > 0 ||
      Number(course.progressPercent ?? 0) >= 100
    );
  }

  function completionSortKey(course: CourseItem) {
    const certificates = (course.certificates as CertificateItem[] | undefined) ?? [];
    const doneAt =
      (course.completedAt as string | undefined) ??
      certificates[0]?.issuedAt ??
      (course.certificate as CertificateItem | null)?.issuedAt;
    return doneAt ? new Date(doneAt).getTime() : 0;
  }

  function openCertHistory(courseTitle: string, certificates: CertificateItem[]) {
    certHistoryModal = { courseTitle, certificates };
  }

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubStaff = showStaffNav.subscribe((show) => {
      if (show) goto('/dashboard');
    });

    const unsubWs = lastMessage.subscribe((msg) => {
      if (shouldRefreshDashboard(msg, get(authUser)?.id)) {
        void refreshCourses();
      }
    });

    return () => {
      unsubAuth();
      unsubStaff();
      unsubWs();
    };
  });

  async function refreshCourses() {
    loading = true;
    try {
      await invalidate('student:courses');
    } finally {
      loading = false;
    }
  }

  const hasAny = $derived(futureCourses.length + completedCourses.length > 0);
</script>

<div class="page-header">
  <h1>{t('courses.title', $locale)}</h1>
  <p>{t('courses.subtitle', $locale)}</p>
</div>

{#if data.loadError}
  <div class="form-error">{data.loadError}</div>
{:else if loading}
  <PageSkeleton variant="list" ariaLabel={t('a11y.loading', $locale)} />
{:else if !hasAny}
  <div class="empty-state">{t('courses.empty', $locale)}</div>
{:else}
  <div class="courses-sections">
    <section class="courses-section panel">
      <div class="panel-header"><h2>{t('courses.sectionFuture', $locale)}</h2></div>
      <div class="panel-body">
        {#if futureCourses.length === 0}
          <p class="courses-section-empty">{t('courses.noFuture', $locale)}</p>
        {:else}
          <div class="student-courses-list">
            {#each futureCourses as course (course.id)}
              <StudentCourseCard {course} variant="future" />
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="courses-section panel">
      <div class="panel-header"><h2>{t('courses.sectionPast', $locale)}</h2></div>
      <div class="panel-body">
        {#if completedCourses.length === 0}
          <p class="courses-section-empty">{t('courses.noPast', $locale)}</p>
        {:else}
          <div class="completed-courses-grid">
            {#each completedCourses as course (course.id)}
              <StudentCompletedCourseTile {course} onOpenHistory={openCertHistory} />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
{/if}

<svelte:window
  onresize={() => {
    viewportHeight = window.innerHeight;
  }}
/>

<CertHistoryModal
  open={Boolean(certHistoryModal)}
  courseTitle={certHistoryModal?.courseTitle ?? ''}
  certificates={certHistoryModal?.certificates ?? []}
  listHeight={certModalListHeight}
  onClose={() => (certHistoryModal = null)}
/>

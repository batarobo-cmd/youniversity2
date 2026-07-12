<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  type UserEnrollment = {
    courseId: string;
    courseTitle: string;
    status: 'active' | 'suspended';
  };

  let {
    enrollments = [],
    userName = '',
  }: {
    enrollments?: UserEnrollment[];
    userName?: string;
  } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let popoverStyle = $state('');

  const sorted = $derived(
    [...enrollments].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.courseTitle.localeCompare(b.courseTitle, $locale);
    }),
  );

  function statusLabel(status: UserEnrollment['status']) {
    if (status === 'active') return t('admin.enrollmentActive', $locale);
    return t('admin.enrollmentSuspended', $locale);
  }

  function placePopover(anchor: HTMLElement | null | undefined) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 300;
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    popoverStyle = `top:${rect.bottom + 6}px;left:${Math.max(12, left)}px;width:${width}px;`;
  }

  function togglePopover(anchor?: HTMLElement | null) {
    if (!open) placePopover(anchor ?? rootEl?.querySelector('.users-course-count'));
    open = !open;
  }

  function closePopover() {
    open = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

{#if enrollments.length === 0}
  <span class="users-cell-empty">{t('admin.usersNoCourses', $locale)}</span>
{:else}
  <div class="users-popover-cell" bind:this={rootEl}>
    <button
      type="button"
      class="users-course-count"
      aria-expanded={open}
      aria-haspopup="dialog"
      onclick={(e) => togglePopover(e.currentTarget)}
      title={t('admin.usersCoursesShowAll', $locale)}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
      </svg>
      <span>{t('admin.usersCoursesCount', $locale, { count: enrollments.length })}</span>
    </button>

    {#if open}
      <div
        class="users-popover users-popover--fixed"
        style={popoverStyle}
        role="dialog"
        aria-label={t('admin.usersCoursesPopover', $locale)}
      >
        <div class="users-popover-head">
          <div>
            <strong>{userName}</strong>
            <span>{t('admin.usersCoursesCount', $locale, { count: enrollments.length })}</span>
          </div>
          <button type="button" class="users-popover-close" onclick={closePopover} aria-label="Close">
            ×
          </button>
        </div>
        <ul class="users-popover-list">
          {#each sorted as enrollment (enrollment.courseId)}
            <li>
              <a
                href="/dashboard/admin/manage/courses/{enrollment.courseId}"
                class="users-popover-link users-popover-link--{enrollment.status}"
                onclick={closePopover}
              >
                <span class="users-popover-link-dot" aria-hidden="true"></span>
                <span class="users-popover-link-title">{enrollment.courseTitle}</span>
                <span class="users-popover-status users-popover-status--{enrollment.status}">
                  {statusLabel(enrollment.status)}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<script lang="ts">
  import { locale, isAdminUser, showStaffNav, isActingAsStudent } from '$lib/stores/auth';
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import type { User } from '@youniversity2/shared';
  import LocaleMenu from '$lib/components/LocaleMenu.svelte';
  import ProfileMenu from '$lib/components/ProfileMenu.svelte';
  import AdminMenu from '$lib/components/AdminMenu.svelte';
  import StudentViewToggle from '$lib/components/StudentViewToggle.svelte';
  import '$lib/styles/app-shell.css';
  import '$lib/styles/admin-menu.css';

  let {
    user = null,
    appVersion = 'dev',
    children,
  }: { user?: User | null; appVersion?: string; children: import('svelte').Snippet } = $props();

  function isActive(path: string) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }

  const showStudentCourses = $derived(!isAdminUser(user) || $isActingAsStudent);
</script>

<div class="app-shell">
  <header class="app-banner">
    <div class="app-banner-inner">
      <a href="/dashboard" class="app-logo">
        <span class="app-logo-mark">YO</span>
        {t('app.title', $locale)}
      </a>

      <nav class="app-nav">
        <a
          href="/dashboard"
          class="app-nav-link"
          class:active={isActive('/dashboard') &&
            !$page.url.pathname.includes('/profile') &&
            !$page.url.pathname.includes('/admin')}
        >
          {t('nav.dashboard', $locale)}
        </a>
        {#if showStudentCourses}
          <a href="/courses" class="app-nav-link" class:active={isActive('/courses')}>
            {t('nav.courses', $locale)}
          </a>
        {/if}
        {#if $showStaffNav}
          <AdminMenu {user} />
        {/if}
      </nav>

      <div class="app-actions">
        <StudentViewToggle {user} />
        <LocaleMenu />
        <ProfileMenu {user} />
      </div>
    </div>
  </header>

  <main class="app-main">
    {#if $isActingAsStudent}
      <div class="student-view-banner" role="status">
        <span>{t('studentView.banner', $locale)}</span>
      </div>
    {/if}
    {@render children()}
  </main>

  {#if isAdminUser(user) && !$isActingAsStudent}
    <div class="app-version-badge" aria-label="Application version">
      {appVersion}
    </div>
  {/if}
</div>

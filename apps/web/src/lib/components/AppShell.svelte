<script lang="ts">

  import { locale, isAdminUser, isPlatformAdminUser, showStaffNav, isActingAsStudent } from '$lib/stores/auth';

  import { page } from '$app/stores';

  import { t } from '$lib/i18n';

  import type { User } from '@youniversity2/shared';

  import LocaleMenu from '$lib/components/LocaleMenu.svelte';

  import SkipLink from '$lib/components/SkipLink.svelte';

  import ProfileMenu from '$lib/components/ProfileMenu.svelte';

  import AdminMenu from '$lib/components/AdminMenu.svelte';

  import StudentViewToggle from '$lib/components/StudentViewToggle.svelte';

  import CommandPalette from '$lib/components/CommandPalette.svelte';

  import MobileNavMenu from '$lib/components/MobileNavMenu.svelte';

  import '$lib/styles/app-shell.css';

  import '$lib/styles/admin-menu.css';



  let {

    user = null,

    appVersion = 'dev',

    systemFeatures = { commandPaletteEnabled: false },

    children,

  }: {

    user?: User | null;

    appVersion?: string;

    systemFeatures?: { commandPaletteEnabled: boolean };

    children: import('svelte').Snippet;

  } = $props();



  function isActive(path: string) {

    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');

  }



  const showStudentCourses = $derived(!isAdminUser(user) || $isActingAsStudent);

  let commandPaletteOpen = $state(false);

  const canUseCommandPalette = $derived(
    Boolean(systemFeatures?.commandPaletteEnabled) &&
      isPlatformAdminUser(user) &&
      !$isActingAsStudent,
  );

</script>



<div class="app-shell">

  <SkipLink />

  <header class="app-banner">

    <div class="app-banner-inner">

      <div class="app-banner-brand">

        <MobileNavMenu {user} {showStudentCourses} {isActive} />

        <a href="/dashboard" class="app-logo">

          <span class="app-logo-mark">YO</span>

          {t('app.title', $locale)}

        </a>

      </div>



      <nav class="app-nav" aria-label={t('nav.main', $locale)}>

        <a

          href="/dashboard"

          class="app-nav-link"

          aria-current={isActive('/dashboard') &&

            !$page.url.pathname.includes('/profile') &&

            !$page.url.pathname.includes('/admin')

            ? 'page'

            : undefined}

          class:active={isActive('/dashboard') &&

            !$page.url.pathname.includes('/profile') &&

            !$page.url.pathname.includes('/admin')}

        >

          {t('nav.dashboard', $locale)}

        </a>

        {#if showStudentCourses}

          <a

            href="/courses"

            class="app-nav-link"

            aria-current={isActive('/courses') ? 'page' : undefined}

            class:active={isActive('/courses')}

          >

            {t('nav.courses', $locale)}

          </a>

        {/if}

        {#if $showStaffNav}

          <AdminMenu {user} />

        {/if}

      </nav>



      <div class="app-actions">
        {#if canUseCommandPalette}
          <button
            type="button"
            class="app-command-icon"
            aria-label={t('command.trigger', $locale)}
            title="{t('command.trigger', $locale)} ({typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'})"
            onclick={() => {
              commandPaletteOpen = true;
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.75" />
              <path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
            </svg>
          </button>
        {/if}
        <StudentViewToggle {user} />

        <LocaleMenu />

        <ProfileMenu {user} />

      </div>

    </div>

  </header>



  <main class="app-main" id="main-content">

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



  {#if canUseCommandPalette}
    <CommandPalette bind:open={commandPaletteOpen} enabled={canUseCommandPalette} />
  {/if}
</div>



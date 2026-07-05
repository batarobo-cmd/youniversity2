<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import type { User } from '@youniversity2/shared';
  import LocaleMenu from '$lib/components/LocaleMenu.svelte';
  import ProfileMenu from '$lib/components/ProfileMenu.svelte';
  import AdminMenu from '$lib/components/AdminMenu.svelte';
  import '$lib/styles/app-shell.css';
  import '$lib/styles/admin-menu.css';

  let {
    user = null,
    children,
  }: { user?: User | null; children: import('svelte').Snippet } = $props();

  function isActive(path: string) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }
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
        <a href="/courses" class="app-nav-link" class:active={isActive('/courses')}>
          {t('nav.courses', $locale)}
        </a>
        <AdminMenu {user} />
      </nav>

      <div class="app-actions">
        <LocaleMenu />
        <ProfileMenu {user} />
      </div>
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>

<script lang="ts">
  import { page } from '$app/stores';
  import { locale, showStaffNav } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { portal } from '$lib/actions/portal';
  import AdminNavTiles from '$lib/components/AdminNavTiles.svelte';
  import { ensureStudentViewCookie } from '$lib/stores/auth';
  import {
    getActiveAdminNavTile,
    getSettingsNavTiles,
    isAdminNavTileActive,
    isAdminPath,
    isAdminSettingsPath,
  } from '$lib/admin-nav';
  import { isPlatformAdminUser, user as authUser } from '$lib/stores/auth';
  import type { User } from '@youniversity2/shared';

  let {
    user = null,
    showStudentCourses = true,
    isActive,
  }: {
    user?: User | null;
    showStudentCourses?: boolean;
    isActive: (path: string) => boolean;
  } = $props();

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();

  const onAdminPage = $derived(isAdminPath($page.url.pathname));
  const inSettings = $derived(isAdminSettingsPath($page.url.pathname));
  const settingsTabs = $derived(getSettingsNavTiles());
  const activeAdminTile = $derived(
    getActiveAdminNavTile($page.url.pathname, isPlatformAdminUser($authUser)),
  );

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function handleNavigate() {
    ensureStudentViewCookie();
    queueMicrotask(() => close());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  let previousPathname = $page.url.pathname;

  $effect(() => {
    const pathname = $page.url.pathname;
    if (pathname !== previousPathname) {
      previousPathname = pathname;
      close();
    }
  });

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mobile-nav-open');
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove('mobile-nav-open');
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  type="button"
  class="app-mobile-nav-toggle"
  bind:this={triggerEl}
  aria-expanded={open}
  aria-controls="app-mobile-nav-panel"
  aria-label={open ? t('nav.closeMenu', $locale) : t('nav.openMenu', $locale)}
  onclick={toggle}
>
  {#if open}
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  {/if}
</button>

{#if open}
  <div use:portal class="app-mobile-nav-backdrop" aria-hidden="true" onclick={close}></div>
  <div
    use:portal
    id="app-mobile-nav-panel"
    class="app-mobile-nav-panel"
    role="dialog"
    aria-modal="true"
    aria-label={t('nav.main', $locale)}
  >
    <div class="app-mobile-nav-panel-inner">
      <div class="app-mobile-nav-links">
        <a
          href="/dashboard"
          class="app-mobile-nav-link"
          class:app-mobile-nav-link--active={isActive('/dashboard') &&
            !$page.url.pathname.includes('/profile') &&
            !$page.url.pathname.includes('/admin')}
          aria-current={isActive('/dashboard') &&
          !$page.url.pathname.includes('/profile') &&
          !$page.url.pathname.includes('/admin')
            ? 'page'
            : undefined}
          onclick={handleNavigate}
        >
          {t('nav.dashboard', $locale)}
        </a>
        {#if showStudentCourses}
          <a
            href="/courses"
            class="app-mobile-nav-link"
            class:app-mobile-nav-link--active={isActive('/courses')}
            aria-current={isActive('/courses') ? 'page' : undefined}
            onclick={handleNavigate}
          >
            {t('nav.courses', $locale)}
          </a>
        {/if}
      </div>

      {#if $showStaffNav && user}
        <div class="app-mobile-nav-admin">
          {#if onAdminPage && activeAdminTile}
            <p class="app-mobile-nav-context">
              {t('nav.administration', $locale)} · {t(activeAdminTile.titleKey, $locale)}
            </p>
          {:else}
            <p class="app-mobile-nav-admin-label">{t('nav.administration', $locale)}</p>
          {/if}
          <AdminNavTiles variant="drawer" onNavigate={handleNavigate} />

          {#if onAdminPage && inSettings}
            <p class="app-mobile-nav-admin-label app-mobile-nav-admin-label--sub">
              {t('admin.menuSettings', $locale)}
            </p>
            <div class="app-mobile-nav-sub-links">
              {#each settingsTabs as tab (tab.href)}
                {@const active = isAdminNavTileActive($page.url.pathname, tab)}
                <a
                  href={tab.href}
                  class="app-mobile-nav-sub-link"
                  class:app-mobile-nav-sub-link--active={active}
                  aria-current={active ? 'page' : undefined}
                  onclick={handleNavigate}
                >
                  {t(tab.titleKey, $locale)}
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

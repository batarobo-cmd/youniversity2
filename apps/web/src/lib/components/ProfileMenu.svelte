<script lang="ts">
  import { locale, isAdminUser, isPlatformAdminUser, isActingAsStudent } from '$lib/stores/auth';
  import { themePreference, setThemePreference, type ThemePreference } from '$lib/stores/theme';
  import { page } from '$app/stores';  import { t } from '$lib/i18n';
  import type { User } from '@youniversity2/shared';
  import UserAvatar from '$lib/components/UserAvatar.svelte';

  let { user = null }: { user?: User | null } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const displayName = $derived(user?.name || user?.email || t('profile.guest', $locale));
  const displayEmail = $derived(user?.email ?? '');
  const roleLabel = $derived(
    !user
      ? ''
      : $isActingAsStudent
        ? t('profile.roleStudent', $locale)
        : user.role === 'admin'
          ? t('profile.roleAdmin', $locale)
          : user.role === 'system_admin'
            ? t('admin.roleSystemAdmin', $locale)
            : t('profile.roleStudent', $locale),
  );

  const showAdminLinks = $derived(isAdminUser(user) && !$isActingAsStudent);
  const showPlatformAdminLinks = $derived(isPlatformAdminUser(user) && !$isActingAsStudent);
  const themeOptions: ThemePreference[] = ['light', 'dark', 'system'];

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  function isActive(path: string) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="profile-menu" bind:this={rootEl}>
  <button
    type="button"
    class="profile-menu-trigger"
    class:profile-menu-trigger--active={open || isActive('/profile')}
    aria-label={t('nav.profile', $locale)}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
  >
    <UserAvatar name={displayName} avatarUrl={user?.avatarUrl} size="md" />
    <svg class="profile-menu-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>

  {#if open}
    <div class="profile-menu-popover" role="menu">
      <div class="profile-menu-header">
        <UserAvatar name={displayName} avatarUrl={user?.avatarUrl} size="lg" />
        <div class="profile-menu-identity">
          <span class="profile-menu-name">{displayName}</span>
          {#if displayEmail}
            <span class="profile-menu-email">{displayEmail}</span>
          {/if}
          {#if roleLabel}
            <span class="profile-menu-role">{roleLabel}</span>
          {/if}
        </div>
      </div>

      {#if !user?.avatarUrl}
        <p class="profile-menu-hint">{t('profile.avatarHint', $locale)}</p>
      {/if}

      <div class="profile-menu-divider"></div>

      <a href="/dashboard/profile" class="profile-menu-item" role="menuitem" onclick={close}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.75" />
          <path
            d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
        {t('profile.menuSettings', $locale)}
      </a>

      {#if !showAdminLinks}
        <a href="/courses" class="profile-menu-item" role="menuitem" onclick={close}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V6.5A2.5 2.5 0 016.5 4H20v13H6.5A2.5 2.5 0 004 19.5z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('profile.menuCourses', $locale)}
        </a>
      {/if}

      <a href="/dashboard" class="profile-menu-item" role="menuitem" onclick={close}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75" />
        </svg>
        {t('nav.dashboard', $locale)}
      </a>

      {#if showAdminLinks}
        <a href="/dashboard/admin/manage" class="profile-menu-item" role="menuitem" onclick={close}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('admin.menuCoursesCategories', $locale)}
        </a>
      {/if}

      {#if showPlatformAdminLinks}
        <a href="/dashboard/admin/users" class="profile-menu-item" role="menuitem" onclick={close}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('admin.menuUsers', $locale)}
        </a>
        <a href="/dashboard/admin/settings/auth" class="profile-menu-item" role="menuitem" onclick={close}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('admin.menuSettings', $locale)}
        </a>
      {/if}

      <div class="profile-menu-divider"></div>

      <div class="profile-menu-theme">
        <span class="profile-menu-theme-label" id="profile-theme-label">{t('theme.label', $locale)}</span>
        <div
          class="profile-menu-theme-options"
          role="radiogroup"
          aria-labelledby="profile-theme-label"
        >
          {#each themeOptions as option}
            <button
              type="button"
              role="radio"
              aria-checked={$themePreference === option}
              class="profile-menu-theme-btn"
              class:profile-menu-theme-btn--active={$themePreference === option}
              onclick={() => setThemePreference(option)}
            >
              {t(`theme.${option}`, $locale)}
            </button>
          {/each}
        </div>
      </div>

      <div class="profile-menu-divider"></div>

      <form method="POST" action="/logout" class="profile-menu-logout" data-sveltekit-reload>
        <button type="submit" class="profile-menu-item profile-menu-item--danger" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t('nav.logout', $locale)}
        </button>
      </form>
    </div>
  {/if}
</div>

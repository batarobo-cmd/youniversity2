<script lang="ts">
  import { page } from '$app/stores';
  import { locale, ensureStudentViewCookie } from '$lib/stores/auth';
  import { isAdminUser, isPlatformAdminUser } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { portal } from '$lib/actions/portal';
  import type { User } from '@youniversity2/shared';

  let { user = null }: { user?: User | null } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let popoverStyle = $state('');

  const showAdmin = $derived(isAdminUser(user));
  const showPlatformAdmin = $derived(isPlatformAdminUser(user));

  function updatePopoverPosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    popoverStyle = `top:${rect.bottom + 6}px;left:${rect.left + rect.width / 2}px;`;
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
    if (open) {
      updatePopoverPosition();
    }
  }

  function close() {
    open = false;
  }

  function handleMenuItemClick(e: MouseEvent) {
    e.stopPropagation();
    ensureStudentViewCookie();
    queueMicrotask(() => close());
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    const target = e.target as Node;
    if (rootEl.contains(target)) return;
    if ((target as HTMLElement).closest?.('.admin-menu-popover')) return;
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  function isActive(path: string) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }

  const adminSectionActive = $derived(isActive('/dashboard/admin'));

  let previousPathname = $page.url.pathname;

  $effect(() => {
    const pathname = $page.url.pathname;
    if (pathname !== previousPathname) {
      previousPathname = pathname;
      close();
    }
  });
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={handleKeydown}
  onresize={updatePopoverPosition}
  onscroll={updatePopoverPosition}
/>

{#if showAdmin}
  <div class="admin-menu" bind:this={rootEl}>
    <button
      type="button"
      class="admin-menu-trigger"
      class:admin-menu-trigger--active={open || adminSectionActive}
      aria-haspopup="menu"
      aria-expanded={open}
      bind:this={triggerEl}
      onclick={toggle}
    >
      <svg class="admin-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="admin-menu-label">{t('nav.administration', $locale)}</span>
      <svg class="admin-menu-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  {#if open}
    <div
      use:portal
      class="admin-menu-popover admin-menu-popover--fixed"
      style={popoverStyle}
      role="menu"
    >
      <a
        href="/dashboard/admin/manage"
        class="admin-menu-item"
        class:admin-menu-item--active={isActive('/dashboard/admin/manage')}
        role="menuitem"
        onclick={handleMenuItemClick}
      >
        {t('admin.menuCoursesCategories', $locale)}
      </a>
      {#if showPlatformAdmin}
        <a
          href="/dashboard/admin/users"
          class="admin-menu-item"
          class:admin-menu-item--active={isActive('/dashboard/admin/users')}
          role="menuitem"
          onclick={handleMenuItemClick}
        >
          {t('admin.menuUsers', $locale)}
        </a>
        <a
          href="/dashboard/admin/auth"
          class="admin-menu-item"
          class:admin-menu-item--active={isActive('/dashboard/admin/auth')}
          role="menuitem"
          onclick={handleMenuItemClick}
        >
          {t('admin.menuAuth', $locale)}
        </a>
      {/if}
    </div>
  {/if}
{/if}

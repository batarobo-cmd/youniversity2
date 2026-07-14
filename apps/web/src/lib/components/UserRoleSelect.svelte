<script lang="ts">
  import { locale, isSystemAdminUser, user as currentUser } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { USER_ROLES, type UserRole } from '@youniversity2/shared';
  import { portal } from '$lib/actions/portal';
  import { focusTrap } from '$lib/actions/focus-trap';
  import { floatingMenuStyle } from '$lib/viewport-pagination';

  let {
    value,
    userId = '',
    userName = '',
    systemAdminCount = 0,
    canAssignSystemAdmin: canAssignSystemAdminProp,
    disabled = false,
    onChange,
  }: {
    value: UserRole;
    userId?: string;
    userName?: string;
    systemAdminCount?: number;
    canAssignSystemAdmin?: boolean;
    disabled?: boolean;
    onChange: (role: UserRole, systemAdminPassword?: string) => void | Promise<void>;
  } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuStyle = $state('');
  let passwordModal = $state<{
    mode: 'confirm';
    targetRole: UserRole;
  } | null>(null);
  let guardPassword = $state('');
  let passwordError = $state('');

  const canAssignSystemAdmin = $derived(
    canAssignSystemAdminProp ?? isSystemAdminUser($currentUser),
  );
  const isSelf = $derived(Boolean(userId && $currentUser?.id === userId));
  const isLastSystemAdmin = $derived(
    isSelf && value === 'system_admin' && systemAdminCount <= 1,
  );
  const canSelfDemoteSystemAdmin = $derived(
    isSelf && value === 'system_admin' && systemAdminCount > 1,
  );
  const isLockedSystemAdmin = $derived(
    value === 'system_admin' && !canAssignSystemAdmin && !canSelfDemoteSystemAdmin,
  );

  const availableRoles = $derived(
    USER_ROLES.filter((role) => {
      if (!canAssignSystemAdmin && role === 'system_admin') return false;
      if (isLastSystemAdmin && role !== 'system_admin') return false;
      return true;
    }),
  );

  const pickerDisabled = $derived(disabled || isLockedSystemAdmin);

  function roleLabel(role: UserRole) {
    if (role === 'system_admin') return t('admin.roleSystemAdmin', $locale);
    if (role === 'admin') return t('admin.roleAdmin', $locale);
    return t('admin.roleStudent', $locale);
  }

  function roleHint(role: UserRole) {
    if (role === 'system_admin') return t('admin.roleSystemAdminHint', $locale);
    if (role === 'admin') return t('admin.roleAdminHint', $locale);
    return t('admin.roleStudentHint', $locale);
  }

  function toggle() {
    if (pickerDisabled) return;
    open = !open;
    if (open && triggerEl) {
      menuStyle = floatingMenuStyle(triggerEl, availableRoles.length * 52 + 16);
    }
  }

  function updateMenuPosition() {
    if (open && triggerEl) {
      menuStyle = floatingMenuStyle(triggerEl, availableRoles.length * 52 + 16);
    }
  }

  function close() {
    open = false;
  }

  function pickRole(role: UserRole) {
    if (role === value) {
      close();
      return;
    }

    if (value === 'system_admin') {
      passwordModal = { mode: 'confirm', targetRole: role };
      guardPassword = '';
      passwordError = '';
      close();
      return;
    }

    close();
    void onChange(role);
  }

  function closePasswordModal() {
    passwordModal = null;
    guardPassword = '';
    passwordError = '';
  }

  async function submitPasswordModal() {
    if (!passwordModal) return;
    passwordError = '';

    if (!guardPassword) {
      passwordError = t('admin.systemAdminPasswordRequired', $locale);
      return;
    }
    await onChange(passwordModal.targetRole, guardPassword);
    closePasswordModal();
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (!open || !rootEl) return;
    const target = e.target as Node;
    if (rootEl.contains(target)) return;
    if ((target as HTMLElement).closest?.('.user-role-menu')) return;
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (passwordModal) closePasswordModal();
      else open = false;
    }
  }
</script>

<svelte:window
  onpointerdown={handleWindowPointerDown}
  onkeydown={handleKeydown}
  onresize={updateMenuPosition}
  onscroll={updateMenuPosition}
/>

<div class="user-role-picker" class:user-role-picker--disabled={pickerDisabled} bind:this={rootEl}>
  {#if isLockedSystemAdmin}
    <div
      class="user-role-trigger user-role-trigger--{value} user-role-trigger--readonly"
      title={t('admin.systemAdminRoleLocked', $locale)}
    >
      <span class="user-role-trigger-dot" aria-hidden="true"></span>
      <span class="user-role-trigger-label">{roleLabel(value)}</span>
    </div>
  {:else}
  <button
    type="button"
    class="user-role-trigger user-role-trigger--{value}"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="{t('admin.usersRole', $locale)} — {userName}"
    disabled={pickerDisabled}
    bind:this={triggerEl}
    onclick={toggle}
  >
    <span class="user-role-trigger-dot" aria-hidden="true"></span>
    <span class="user-role-trigger-label">{roleLabel(value)}</span>
    <svg class="user-role-trigger-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </button>

  {#if open}
    <div
      use:portal
      class="user-role-menu user-role-menu--floating"
      style={menuStyle}
      role="listbox"
      aria-label={t('admin.usersRole', $locale)}
    >
      {#each availableRoles as role}
        <button
          type="button"
          role="option"
          aria-selected={role === value}
          class="user-role-option"
          class:user-role-option--active={role === value}
          onclick={() => pickRole(role)}
        >
          <span class="user-role-option-dot user-role-option-dot--{role}" aria-hidden="true"></span>
          <span class="user-role-option-body">
            <span class="user-role-option-label">{roleLabel(role)}</span>
            <span class="user-role-option-hint">{roleHint(role)}</span>
          </span>
          {#if role === value}
            <svg class="user-role-option-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12l4 4L19 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
  {/if}
</div>

{#if passwordModal}
  <div
    class="user-role-password-backdrop"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closePasswordModal()}
  >
    <div class="user-role-password-modal" role="dialog" aria-modal="true" aria-labelledby="user-role-password-title" use:focusTrap={passwordModal}>
      <h3 id="user-role-password-title">{t('admin.systemAdminPasswordConfirmTitle', $locale)}</h3>
      <p class="user-role-password-lead">{t('admin.systemAdminPasswordConfirmLead', $locale)}</p>

      {#if passwordError}
        <div class="admin-flash admin-flash--err">{passwordError}</div>
      {/if}

      <label class="user-role-password-field">
        <span>{t('admin.systemAdminPasswordLabel', $locale)}</span>
        <input type="password" bind:value={guardPassword} autocomplete="current-password" />
      </label>

      <div class="user-role-password-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick={closePasswordModal}>
          {t('admin.cancel', $locale)}
        </button>
        <button type="button" class="btn btn-sm" onclick={() => void submitPasswordModal()}>
          {t('profile.save', $locale)}
        </button>
      </div>
    </div>
  </div>
{/if}

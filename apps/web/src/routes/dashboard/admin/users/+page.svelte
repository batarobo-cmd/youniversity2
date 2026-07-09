<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import {
    isAuthenticated,
    isPlatformAdmin,
    user as currentUser,
    locale,
  } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { submitAction, actionErrorMessage, isActionSuccess } from '$lib/client/form-action';
  import { USER_ROLES, SUPPORTED_LOCALES, type UserRole } from '@youniversity2/shared';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserLogsModal from '$lib/components/UserLogsModal.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';
  import '$lib/styles/admin-users.css';

  type ManagedUser = {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    preferredLocale: string;
    avatarUrl?: string;
    oauthProvider?: string;
    hasPassword: boolean;
    isSuspended: boolean;
    givenName?: string;
    familyName?: string;
    jobTitle?: string;
    department?: string;
    employeeId?: string;
    companyName?: string;
    companyDomain?: string;
    officeLocation?: string;
    mobilePhone?: string;
    businessPhone?: string;
    city?: string;
    country?: string;
    profileSyncedAt?: string;
    createdAt: string;
  };

  let { data }: { data: PageData } = $props();

  const users = $derived(data.users as ManagedUser[]);
  let loading = $state(false);
  let search = $state('');
  let message = $state('');
  let mutationError = $state('');
  const error = $derived(mutationError || data.loadError || '');

  let modalOpen = $state(false);
  let editing = $state<ManagedUser | null>(null);

  let formName = $state('');
  let formEmail = $state('');
  let formPassword = $state('');
  let formRole = $state<UserRole>('student');
  let formLocale = $state('sk');
  let formGivenName = $state('');
  let formFamilyName = $state('');
  let formJobTitle = $state('');
  let formDepartment = $state('');
  let formEmployeeId = $state('');
  let formCompanyName = $state('');
  let formOfficeLocation = $state('');
  let formMobilePhone = $state('');
  let formBusinessPhone = $state('');
  let formCity = $state('');
  let formCountry = $state('');
  let saving = $state(false);
  let logsUser = $state<ManagedUser | null>(null);
  let logsOpen = $state(false);

  const filtered = $derived(
    users.filter((u) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employeeId?.toLowerCase().includes(q) ?? false) ||
        (u.department?.toLowerCase().includes(q) ?? false) ||
        (u.companyName?.toLowerCase().includes(q) ?? false)
      );
    }),
  );

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isPlatformAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  async function refreshUsers() {
    loading = true;
    try {
      await invalidate('admin:users');
    } finally {
      loading = false;
    }
  }

  async function runMutation(action: string, fields: Record<string, string | null | undefined>) {
    mutationError = '';
    const result = await submitAction(action, fields);
    const actionError = actionErrorMessage(result);
    if (!isActionSuccess(result) || actionError) {
      mutationError = actionError ?? 'Operácia zlyhala.';
      return false;
    }
    message = t('admin.saved', $locale);
    await refreshUsers();
    return true;
  }

  function roleLabel(role: UserRole) {
    if (role === 'admin') return t('admin.roleAdmin', $locale);
    if (role === 'instructor') return t('admin.roleInstructor', $locale);
    return t('admin.roleStudent', $locale);
  }

  function openCreate() {
    editing = null;
    formName = '';
    formEmail = '';
    formPassword = '';
    formRole = 'student';
    formLocale = $locale;
    formGivenName = '';
    formFamilyName = '';
    formJobTitle = '';
    formDepartment = '';
    formEmployeeId = '';
    formCompanyName = '';
    formOfficeLocation = '';
    formMobilePhone = '';
    formBusinessPhone = '';
    formCity = '';
    formCountry = '';
    modalOpen = true;
    mutationError = '';
    message = '';
  }

  function openEdit(u: ManagedUser) {
    editing = u;
    formName = u.name;
    formEmail = u.email;
    formPassword = '';
    formRole = u.role;
    formLocale = u.preferredLocale;
    formGivenName = u.givenName ?? '';
    formFamilyName = u.familyName ?? '';
    formJobTitle = u.jobTitle ?? '';
    formDepartment = u.department ?? '';
    formEmployeeId = u.employeeId ?? '';
    formCompanyName = u.companyName ?? '';
    formOfficeLocation = u.officeLocation ?? '';
    formMobilePhone = u.mobilePhone ?? '';
    formBusinessPhone = u.businessPhone ?? '';
    formCity = u.city ?? '';
    formCountry = u.country ?? '';
    modalOpen = true;
    mutationError = '';
    message = '';
  }

  function closeModal() {
    modalOpen = false;
    editing = null;
  }

  function profilePayload(): Record<string, string | null> {
    return {
      givenName: formGivenName.trim() || null,
      familyName: formFamilyName.trim() || null,
      jobTitle: formJobTitle.trim() || null,
      department: formDepartment.trim() || null,
      employeeId: formEmployeeId.trim() || null,
      companyName: formCompanyName.trim() || null,
      officeLocation: formOfficeLocation.trim() || null,
      mobilePhone: formMobilePhone.trim() || null,
      businessPhone: formBusinessPhone.trim() || null,
      city: formCity.trim() || null,
      country: formCountry.trim() || null,
    };
  }

  async function saveUser(e: Event) {
    e.preventDefault();
    saving = true;
    mutationError = '';
    message = '';
    try {
      if (editing) {
        const payload: Record<string, string | null> = {
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          preferredLocale: formLocale,
          ...profilePayload(),
        };
        if (formPassword.trim()) payload.password = formPassword;
        const ok = await runMutation('saveUser', {
          mode: 'update',
          id: editing.id,
          payload: JSON.stringify(payload),
        });
        if (ok) closeModal();
      } else {
        if (!formPassword.trim()) {
          mutationError = t('auth.password', $locale) + '?';
          saving = false;
          return;
        }
        const ok = await runMutation('saveUser', {
          mode: 'create',
          payload: JSON.stringify({
            name: formName.trim(),
            email: formEmail.trim(),
            password: formPassword,
            role: formRole,
            preferredLocale: formLocale,
            ...profilePayload(),
          }),
        });
        if (ok) closeModal();
      }
    } finally {
      saving = false;
    }
  }

  function openLogs(u: ManagedUser) {
    logsUser = u;
    logsOpen = true;
  }

  function closeLogs() {
    logsOpen = false;
    logsUser = null;
  }

  async function removeUser(u: ManagedUser) {
    if (!confirm(t('admin.usersDeleteConfirm', $locale))) return;
    mutationError = '';
    message = '';
    await runMutation('deleteUser', { id: u.id });
  }

  async function toggleSuspend(u: ManagedUser) {
    const willSuspend = !u.isSuspended;
    const confirmKey = willSuspend ? 'admin.usersSuspendConfirm' : 'admin.usersUnsuspendConfirm';
    if (!confirm(t(confirmKey, $locale))) return;
    mutationError = '';
    message = '';
    await runMutation('saveUser', {
      mode: 'update',
      id: u.id,
      payload: JSON.stringify({ isSuspended: willSuspend }),
    });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString($locale === 'sk' ? 'sk-SK' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
</script>

<div class="admin-manage-header">
  <h1>{t('admin.usersTitle', $locale)}</h1>
  <p>{t('admin.usersSub', $locale)}</p>
</div>

{#if message}
  <div class="admin-flash admin-flash--ok">{message}</div>
{/if}
{#if error && !modalOpen}
  <div class="admin-flash admin-flash--err">{error}</div>
{/if}

<div class="admin-users-toolbar">
  <div class="admin-users-search">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.75" />
      <path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </svg>
    <input type="search" placeholder={t('admin.usersSearch', $locale)} bind:value={search} />
  </div>
  <span class="admin-users-meta">{filtered.length} / {users.length} {t('admin.usersTotal', $locale)}</span>
  <button type="button" class="btn btn-sm" onclick={openCreate}>{t('admin.usersNew', $locale)}</button>
</div>

{#if loading}
  <p class="loading-text">...</p>
{:else if filtered.length === 0}
  <div class="empty-state panel">{t('admin.usersEmpty', $locale)}</div>
{:else}
  <div class="users-table-wrap">
    <table class="users-table">
      <thead>
        <tr>
          <th>{t('auth.name', $locale)}</th>
          <th>{t('admin.usersRole', $locale)}</th>
          <th>{t('admin.usersCreated', $locale)}</th>
          <th style="text-align: right;">{t('admin.usersActions', $locale)}</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as u}
          <tr class:users-row--suspended={u.isSuspended}>
            <td>
              <div class="users-cell-user">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <div>
                  <div class="users-cell-name">
                    {u.name}
                    {#if $currentUser?.id === u.id}
                      <span class="users-you-tag">{t('admin.usersYou', $locale)}</span>
                    {/if}
                    {#if u.isSuspended}
                      <span class="users-status-badge">{t('admin.usersSuspended', $locale)}</span>
                    {/if}
                  </div>
                  <div class="users-cell-email">{u.email}</div>
                  {#if u.employeeId || u.department || u.companyName}
                    <div class="users-cell-meta">
                      {#if u.employeeId}
                        {t('profile.employeeId', $locale)}: {u.employeeId}
                      {/if}
                      {#if u.department}
                        {#if u.employeeId} · {/if}{u.department}
                      {/if}
                      {#if u.companyName}
                        {#if u.employeeId || u.department} · {/if}{u.companyName}
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </td>
            <td>
              <span class="users-role-badge users-role-badge--{u.role}">{roleLabel(u.role)}</span>
              <div class="users-auth-badge">
                {u.oauthProvider ? t('admin.usersOAuth', $locale) : t('admin.usersLocal', $locale)}
                {#if u.oauthProvider}
                  · {u.oauthProvider}
                {/if}
              </div>
            </td>
            <td>{formatDate(u.createdAt)}</td>
            <td>
              <div class="users-actions">
                <button
                  type="button"
                  class="users-action-btn"
                  title={t('admin.usersLogs', $locale)}
                  onclick={() => openLogs(u)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 3.5L18.5 8H14V3.5zM8 13h8M8 17h5"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="users-action-btn"
                  title={t('admin.usersEdit', $locale)}
                  onclick={() => openEdit(u)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                {#if $currentUser?.id !== u.id}
                  <button
                    type="button"
                    class="users-action-btn"
                    class:users-action-btn--warn={!u.isSuspended}
                    class:users-action-btn--success={u.isSuspended}
                    title={u.isSuspended
                      ? t('admin.usersUnsuspend', $locale)
                      : t('admin.usersSuspend', $locale)}
                    onclick={() => toggleSuspend(u)}
                  >
                    {#if u.isSuspended}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M9 12l2 2 4-4M12 22a10 10 0 100-20 10 10 0 000 20z"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    {:else}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" />
                        <path
                          d="M8 8l8 8M16 8l-8 8"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                        />
                      </svg>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="users-action-btn users-action-btn--danger"
                    title={t('admin.usersDelete', $locale)}
                    onclick={() => removeUser(u)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if modalOpen}
  <div
    class="users-modal-backdrop"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closeModal()}
  >
    <div class="users-modal" role="dialog" aria-modal="true">
      <div class="users-modal-header">
        <h2>{editing ? t('admin.usersEdit', $locale) : t('admin.usersCreate', $locale)}</h2>
        <button type="button" class="users-modal-close" onclick={closeModal} aria-label="Close">×</button>
      </div>
      <form class="users-modal-body" onsubmit={saveUser}>
        {#if error}
          <div class="admin-flash admin-flash--err">{error}</div>
        {/if}
        <div>
          <label for="u-name">{t('auth.name', $locale)}</label>
          <input id="u-name" bind:value={formName} required />
        </div>
        <div>
          <label for="u-email">{t('auth.email', $locale)}</label>
          <input id="u-email" type="email" bind:value={formEmail} required />
        </div>
        <div>
          <label for="u-role">{t('admin.usersRole', $locale)}</label>
          <select
            id="u-role"
            bind:value={formRole}
            disabled={editing !== null && $currentUser?.id === editing.id}
          >
            {#each USER_ROLES as role}
              <option value={role}>{roleLabel(role)}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="u-locale">{t('locale.label', $locale)}</label>
          <select id="u-locale" bind:value={formLocale}>
            {#each SUPPORTED_LOCALES as loc}
              <option value={loc}>{loc.toUpperCase()}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="u-pass">
            {editing ? t('admin.usersPasswordOptional', $locale) : t('auth.password', $locale)}
          </label>
          <input
            id="u-pass"
            type="password"
            bind:value={formPassword}
            required={!editing}
            minlength={editing ? undefined : 8}
            autocomplete="new-password"
          />
        </div>

        <div class="users-modal-divider">{t('profile.work', $locale)}</div>
        <div class="users-modal-grid">
            <div>
              <label for="u-given">{t('profile.givenName', $locale)}</label>
              <input id="u-given" bind:value={formGivenName} />
            </div>
            <div>
              <label for="u-family">{t('profile.familyName', $locale)}</label>
              <input id="u-family" bind:value={formFamilyName} />
            </div>
            <div>
              <label for="u-job">{t('profile.jobTitle', $locale)}</label>
              <input id="u-job" bind:value={formJobTitle} />
            </div>
            <div>
              <label for="u-dept">{t('profile.department', $locale)}</label>
              <input id="u-dept" bind:value={formDepartment} />
            </div>
            <div>
              <label for="u-empid">{t('profile.employeeId', $locale)}</label>
              <input id="u-empid" bind:value={formEmployeeId} />
            </div>
            <div>
              <label for="u-company">{t('profile.companyName', $locale)}</label>
              <input id="u-company" bind:value={formCompanyName} />
            </div>
            <div>
              <label for="u-office">{t('profile.officeLocation', $locale)}</label>
              <input id="u-office" bind:value={formOfficeLocation} />
            </div>
            <div>
              <label for="u-mobile">{t('profile.mobilePhone', $locale)}</label>
              <input id="u-mobile" type="tel" bind:value={formMobilePhone} />
            </div>
            <div>
              <label for="u-business">{t('profile.businessPhone', $locale)}</label>
              <input id="u-business" type="tel" bind:value={formBusinessPhone} />
            </div>
            <div>
              <label for="u-city">{t('profile.city', $locale)}</label>
              <input id="u-city" bind:value={formCity} />
            </div>
            <div>
              <label for="u-country">{t('profile.country', $locale)}</label>
              <input id="u-country" bind:value={formCountry} />
            </div>
          </div>

        <div class="users-modal-footer">
          <button type="button" class="btn btn-ghost btn-sm" onclick={closeModal}>
            {t('admin.cancel', $locale)}
          </button>
          <button type="submit" class="btn btn-sm" disabled={saving}>
            {saving ? '...' : editing ? t('profile.save', $locale) : t('admin.usersCreate', $locale)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if logsOpen && logsUser}
  <UserLogsModal user={logsUser} open={logsOpen} onClose={closeLogs} />
{/if}

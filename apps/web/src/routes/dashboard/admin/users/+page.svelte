<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    isAuthenticated,
    isPlatformAdmin,
    user as currentUser,
    locale,
  } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { USER_ROLES, SUPPORTED_LOCALES, type UserRole } from '@youniversity2/shared';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserLogsModal from '$lib/components/UserLogsModal.svelte';
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
    createdAt: string;
  };

  let users = $state<ManagedUser[]>([]);
  let loading = $state(true);
  let search = $state('');
  let message = $state('');
  let error = $state('');

  let modalOpen = $state(false);
  let editing = $state<ManagedUser | null>(null);

  let formName = $state('');
  let formEmail = $state('');
  let formPassword = $state('');
  let formRole = $state<UserRole>('student');
  let formLocale = $state('sk');
  let saving = $state(false);
  let logsUser = $state<ManagedUser | null>(null);
  let logsOpen = $state(false);

  const filtered = $derived(
    users.filter((u) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }),
  );

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isPlatformAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
      else void loadUsers();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  async function loadUsers() {
    loading = true;
    error = '';
    try {
      users = (await api.getUsers()) as ManagedUser[];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
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
    modalOpen = true;
    error = '';
    message = '';
  }

  function openEdit(u: ManagedUser) {
    editing = u;
    formName = u.name;
    formEmail = u.email;
    formPassword = '';
    formRole = u.role;
    formLocale = u.preferredLocale;
    modalOpen = true;
    error = '';
    message = '';
  }

  function closeModal() {
    modalOpen = false;
    editing = null;
  }

  async function saveUser(e: Event) {
    e.preventDefault();
    saving = true;
    error = '';
    message = '';
    try {
      if (editing) {
        const payload: Record<string, string> = {
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          preferredLocale: formLocale,
        };
        if (formPassword.trim()) payload.password = formPassword;
        await api.updateUser(editing.id, payload);
      } else {
        if (!formPassword.trim()) {
          error = t('auth.password', $locale) + '?';
          saving = false;
          return;
        }
        await api.createUser({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
          preferredLocale: formLocale,
        });
      }
      message = t('admin.saved', $locale);
      closeModal();
      await loadUsers();
    } catch (e) {
      error = (e as Error).message;
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
    error = '';
    message = '';
    try {
      await api.deleteUser(u.id);
      message = t('admin.saved', $locale);
      await loadUsers();
    } catch (e) {
      error = (e as Error).message;
    }
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
          <tr>
            <td>
              <div class="users-cell-user">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <div>
                  <div class="users-cell-name">
                    {u.name}
                    {#if $currentUser?.id === u.id}
                      <span class="users-you-tag">{t('admin.usersYou', $locale)}</span>
                    {/if}
                  </div>
                  <div class="users-cell-email">{u.email}</div>
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

<script lang="ts">
  import { locale, user, token } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { api } from '$lib/api';
  import '$lib/styles/admin-users.css';

  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let saving = $state(false);

  const open = $derived(
    Boolean($user?.role === 'system_admin' && $user?.needsSystemAdminPassword),
  );

  async function submit() {
    error = '';
    if (password.length < 8) {
      error = t('admin.systemAdminPasswordMin', $locale);
      return;
    }
    if (password !== confirmPassword) {
      error = t('admin.systemAdminPasswordMismatch', $locale);
      return;
    }
    saving = true;
    try {
      const updated = await api.setSystemAdminPassword(password, confirmPassword);
      user.set(updated);
      password = '';
      confirmPassword = '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <div class="user-role-password-backdrop" role="presentation">
    <div class="user-role-password-modal" role="dialog" aria-modal="true">
      <h3>{t('admin.systemAdminAssignedTitle', $locale)}</h3>
      <p class="user-role-password-lead">{t('admin.systemAdminAssignedLead', $locale)}</p>

      {#if error}
        <div class="admin-flash admin-flash--err">{error}</div>
      {/if}

      <label class="user-role-password-field">
        <span>{t('admin.systemAdminPasswordLabel', $locale)}</span>
        <input type="password" bind:value={password} autocomplete="new-password" />
      </label>

      <label class="user-role-password-field">
        <span>{t('admin.systemAdminPasswordConfirmLabel', $locale)}</span>
        <input type="password" bind:value={confirmPassword} autocomplete="new-password" />
      </label>

      <div class="user-role-password-actions">
        <button type="button" class="btn btn-sm" disabled={saving} onclick={() => void submit()}>
          {t('profile.save', $locale)}
        </button>
      </div>
    </div>
  </div>
{/if}

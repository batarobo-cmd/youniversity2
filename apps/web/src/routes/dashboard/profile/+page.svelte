<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, isAuthenticated, locale, setLocale, setAuth } from '$lib/stores/auth';
  import { actionErrorMessage, isActionSuccess, submitAction } from '$lib/client/form-action';
  import { t, SUPPORTED_LOCALES } from '$lib/i18n';
  import type { Locale, User } from '@youniversity2/shared';
  import { firstZodIssue, profilePatchSchema } from '@youniversity2/shared';
  import { SESSION_STORAGE_KEY } from '$lib/session';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import '$lib/styles/dashboard.css';

  let name = $state('');
  let givenName = $state('');
  let familyName = $state('');
  let jobTitle = $state('');
  let department = $state('');
  let employeeId = $state('');
  let companyName = $state('');
  let officeLocation = $state('');
  let mobilePhone = $state('');
  let businessPhone = $state('');
  let city = $state('');
  let country = $state('');
  let preferredLocale = $state<Locale>('sk');
  let currentPassword = $state('');
  let newPassword = $state('');
  let message = $state('');
  let error = $state('');
  let saving = $state(false);

  const hasPassword = $derived($user?.hasPassword !== false);

  function loadFromUser(u: User) {
    name = u.name;
    givenName = u.givenName ?? '';
    familyName = u.familyName ?? '';
    jobTitle = u.jobTitle ?? '';
    department = u.department ?? '';
    employeeId = u.employeeId ?? '';
    companyName = u.companyName ?? '';
    officeLocation = u.officeLocation ?? '';
    mobilePhone = u.mobilePhone ?? '';
    businessPhone = u.businessPhone ?? '';
    city = u.city ?? '';
    country = u.country ?? '';
    preferredLocale = (u.preferredLocale as Locale) ?? 'sk';
  }

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubUser = user.subscribe((u) => {
      if (u) loadFromUser(u);
    });
    return () => {
      unsubAuth();
      unsubUser();
    };
  });

  async function saveProfile(e: Event) {
    e.preventDefault();
    error = '';
    message = '';
    saving = true;

    try {
      const payload: Record<string, string | null> = {
        preferredLocale,
        name,
        givenName: givenName || null,
        familyName: familyName || null,
        jobTitle: jobTitle || null,
        department: department || null,
        employeeId: employeeId || null,
        companyName: companyName || null,
        officeLocation: officeLocation || null,
        mobilePhone: mobilePhone || null,
        businessPhone: businessPhone || null,
        city: city || null,
        country: country || null,
      };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const parsed = profilePatchSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(firstZodIssue(parsed.error));
      }

      const result = await submitAction('saveProfile', {
        payload: JSON.stringify(parsed.data),
      });
      const err = actionErrorMessage(result);
      if (!isActionSuccess(result) || err) throw new Error(err ?? 'Uloženie zlyhalo.');
      const updated = (result.data as { user?: User } | undefined)?.user;
      setLocale(preferredLocale);
      const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
      if ($user && sessionId && updated) setAuth(sessionId, { ...$user, ...updated });
      message = t('profile.saved', $locale);
      currentPassword = '';
      newPassword = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="profile-hero">
  <UserAvatar
    name={$user?.name ?? $user?.email ?? ''}
    avatarUrl={$user?.avatarUrl}
    size="lg"
  />
  <div class="profile-hero-text">
    <h1>{t('nav.profile', $locale)}</h1>
    <p>{t('profile.subtitle', $locale)}</p>
  </div>
</div>

<div class="panel profile-panel">
  <div class="panel-body">
    <p class="profile-avatar-hint">{t('profile.avatarHint', $locale)}</p>
    {#if $user?.oauthProvider}
      <p class="profile-oauth-note">
        {t('profile.oauthProvider', $locale)}: {$user.oauthProvider}. {t('profile.oauthManualHint', $locale)}
      </p>
    {/if}

    {#if message}
      <div class="form-success">{message}</div>
    {/if}
    {#if error}
      <div class="form-error">{error}</div>
    {/if}

    <form class="profile-form" onsubmit={saveProfile}>
      <div class="profile-section">
        <h2>{t('profile.general', $locale)}</h2>
        <div class="profile-grid">
          <div>
            <label for="email">{t('auth.email', $locale)}</label>
            <input id="email" type="email" value={$user?.email ?? ''} disabled />
          </div>
          {#if $user?.companyDomain}
            <div>
              <label for="domain">{t('profile.companyDomain', $locale)}</label>
              <input id="domain" type="text" value={$user.companyDomain} disabled />
            </div>
          {/if}
          <div>
            <label for="name">{t('auth.name', $locale)}</label>
            <input id="name" bind:value={name} required />
          </div>
          <div>
            <label for="pref-locale">{t('locale.label', $locale)}</label>
            <select id="pref-locale" bind:value={preferredLocale}>
              {#each SUPPORTED_LOCALES as loc}
                <option value={loc}>{loc.toUpperCase()}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <div class="profile-section">
        <h2>{t('profile.work', $locale)}</h2>
        <div class="profile-grid">
          <div>
            <label for="given-name">{t('profile.givenName', $locale)}</label>
            <input id="given-name" bind:value={givenName} />
          </div>
          <div>
            <label for="family-name">{t('profile.familyName', $locale)}</label>
            <input id="family-name" bind:value={familyName} />
          </div>
          <div>
            <label for="job-title">{t('profile.jobTitle', $locale)}</label>
            <input id="job-title" bind:value={jobTitle} />
          </div>
          <div>
            <label for="department">{t('profile.department', $locale)}</label>
            <input id="department" bind:value={department} />
          </div>
          <div>
            <label for="employee-id">{t('profile.employeeId', $locale)}</label>
            <input id="employee-id" bind:value={employeeId} />
          </div>
          <div>
            <label for="company">{t('profile.companyName', $locale)}</label>
            <input id="company" bind:value={companyName} />
          </div>
          <div>
            <label for="office">{t('profile.officeLocation', $locale)}</label>
            <input id="office" bind:value={officeLocation} />
          </div>
        </div>
      </div>

      <div class="profile-section">
        <h2>{t('profile.contact', $locale)}</h2>
        <div class="profile-grid">
          <div>
            <label for="mobile">{t('profile.mobilePhone', $locale)}</label>
            <input id="mobile" type="tel" bind:value={mobilePhone} />
          </div>
          <div>
            <label for="business">{t('profile.businessPhone', $locale)}</label>
            <input id="business" type="tel" bind:value={businessPhone} />
          </div>
        </div>
      </div>

      <div class="profile-section">
        <h2>{t('profile.address', $locale)}</h2>
        <div class="profile-grid">
          <div>
            <label for="city">{t('profile.city', $locale)}</label>
            <input id="city" bind:value={city} />
          </div>
          <div>
            <label for="country">{t('profile.country', $locale)}</label>
            <input id="country" bind:value={country} />
          </div>
        </div>
      </div>

      {#if hasPassword}
        <div class="profile-section">
          <h2>{t('profile.security', $locale)}</h2>
          <div class="profile-grid">
            <div>
              <label for="current-pw">{t('profile.currentPassword', $locale)}</label>
              <input id="current-pw" type="password" bind:value={currentPassword} autocomplete="current-password" />
            </div>
            <div>
              <label for="new-pw">{t('profile.newPassword', $locale)}</label>
              <input id="new-pw" type="password" bind:value={newPassword} minlength="8" autocomplete="new-password" />
            </div>
          </div>
        </div>
      {/if}

      <button type="submit" class="login-submit" disabled={saving}>
        {saving ? '...' : t('profile.save', $locale)}
      </button>
    </form>
  </div>
</div>

<style>
  .profile-panel {
    max-width: 720px;
  }

  .profile-oauth-note {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    background: rgba(99, 102, 241, 0.08);
    color: var(--color-text);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .profile-oauth-provider {
    display: block;
    margin-top: 0.35rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .profile-avatar-hint {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .profile-section {
    margin-bottom: 1.5rem;
  }

  .profile-section h2 {
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem 1rem;
  }

  @media (max-width: 640px) {
    .profile-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

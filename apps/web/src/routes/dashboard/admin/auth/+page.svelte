<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isPlatformAdmin, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';

  type ProviderForm = {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    hasClientSecret: boolean;
    configured: boolean;
    tenantId?: string;
  };

  let loading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  let manualRegistrationEnabled = $state(true);
  let loginDomainsText = $state('');
  let registerDomainsText = $state('');
  let google = $state<ProviderForm>({
    enabled: false,
    clientId: '',
    clientSecret: '',
    hasClientSecret: false,
    configured: false,
  });
  let microsoft = $state<ProviderForm>({
    enabled: false,
    clientId: '',
    clientSecret: '',
    hasClientSecret: false,
    configured: false,
    tenantId: 'common',
  });

  const googleShowOnLogin = $derived(
    google.enabled && (google.configured || (Boolean(google.clientId.trim()) && (google.hasClientSecret || Boolean(google.clientSecret.trim())))),
  );
  const microsoftShowOnLogin = $derived(
    microsoft.enabled && (microsoft.configured || (Boolean(microsoft.clientId.trim()) && (microsoft.hasClientSecret || Boolean(microsoft.clientSecret.trim())))),
  );

  const apiBase = typeof window !== 'undefined' ? window.location.origin : '';

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isPlatformAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
      else void loadSettings();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
    };
  });

  function domainsToText(domains: string[]) {
    return domains.join('\n');
  }

  function textToDomains(text: string) {
    return text
      .split(/[\n,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);
  }

  async function loadSettings() {
    loading = true;
    error = '';
    try {
      const data = (await api.getAdminAuthSettings()) as Record<string, unknown>;
      manualRegistrationEnabled = Boolean(data.manualRegistrationEnabled);
      loginDomainsText = domainsToText((data.allowedLoginDomains as string[]) ?? []);
      registerDomainsText = domainsToText((data.allowedRegistrationDomains as string[]) ?? []);

      const g = data.google as Record<string, unknown>;
      google = {
        enabled: Boolean(g?.enabled),
        clientId: String(g?.clientId ?? ''),
        clientSecret: '',
        hasClientSecret: Boolean(g?.hasClientSecret),
        configured: Boolean(g?.configured),
      };

      const m = data.microsoft as Record<string, unknown>;
      microsoft = {
        enabled: Boolean(m?.enabled),
        clientId: String(m?.clientId ?? ''),
        clientSecret: '',
        hasClientSecret: Boolean(m?.hasClientSecret),
        configured: Boolean(m?.configured),
        tenantId: String(m?.tenantId ?? 'common'),
      };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function saveSettings(e: Event) {
    e.preventDefault();
    saving = true;
    error = '';
    message = '';
    try {
      await api.updateAdminAuthSettings({
        manualRegistrationEnabled,
        allowedLoginDomains: textToDomains(loginDomainsText),
        allowedRegistrationDomains: textToDomains(registerDomainsText),
        google: {
          enabled: google.enabled,
          clientId: google.clientId.trim(),
          clientSecret: google.clientSecret,
        },
        microsoft: {
          enabled: microsoft.enabled,
          clientId: microsoft.clientId.trim(),
          clientSecret: microsoft.clientSecret,
          tenantId: microsoft.tenantId?.trim() || 'common',
        },
      });
      message = t('admin.saved', $locale);
      await loadSettings();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="admin-manage-header">
  <h1>{t('admin.authTitle', $locale)}</h1>
  <p>{t('admin.authSub', $locale)}</p>
</div>

{#if message}
  <div class="admin-flash admin-flash--ok">{message}</div>
{/if}
{#if error}
  <div class="admin-flash admin-flash--err">{error}</div>
{/if}

{#if loading}
  <p class="loading-text">...</p>
{:else}
  <form class="auth-settings-form" onsubmit={saveSettings}>
    <section class="auth-card panel">
      <div class="panel-body">
        <h2>{t('admin.authManual', $locale)}</h2>
        <p class="auth-settings-note">{t('admin.authManualLoginAlways', $locale)}</p>
        <div class="auth-switch-list">
          <label class="auth-switch-row">
            <span>{t('admin.authManualRegister', $locale)}</span>
            <span class="auth-switch">
              <input type="checkbox" bind:checked={manualRegistrationEnabled} />
              <span class="auth-switch-slider"></span>
            </span>
          </label>
        </div>
      </div>
    </section>

    <section class="auth-card panel">
      <div class="panel-body">
        <h2>{t('admin.authDomains', $locale)}</h2>
        <div class="auth-settings-grid">
          <div class="auth-settings-field">
            <label for="login-domains">{t('admin.authLoginDomains', $locale)}</label>
            <textarea id="login-domains" rows="5" bind:value={loginDomainsText}></textarea>
            <p class="auth-settings-hint">{t('admin.authLoginDomainsHint', $locale)}</p>
          </div>
          <div class="auth-settings-field">
            <label for="register-domains">{t('admin.authRegisterDomains', $locale)}</label>
            <textarea id="register-domains" rows="5" bind:value={registerDomainsText}></textarea>
            <p class="auth-settings-hint">{t('admin.authRegisterDomainsHint', $locale)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="auth-card panel">
      <div class="panel-body">
        <h2>{t('admin.authOAuth', $locale)}</h2>

        <div class="auth-providers-grid">
          <article class="auth-provider-card">
            <div class="auth-provider-head">
              <h3>{t('admin.authGoogle', $locale)}</h3>
              <label class="auth-switch-row auth-switch-row--compact">
                <span>{t('admin.authProviderEnabled', $locale)}</span>
                <span class="auth-switch">
                  <input type="checkbox" bind:checked={google.enabled} />
                  <span class="auth-switch-slider"></span>
                </span>
              </label>
            </div>
            {#if google.enabled && !googleShowOnLogin}
              <p class="auth-settings-warn">{t('admin.authOAuthNeedsCredentials', $locale)}</p>
            {/if}
            <div class="auth-provider-fields">
              <div>
                <label for="google-client-id">{t('admin.authClientId', $locale)}</label>
                <input id="google-client-id" bind:value={google.clientId} autocomplete="off" />
              </div>
              <div>
                <label for="google-client-secret">{t('admin.authClientSecret', $locale)}</label>
                <input
                  id="google-client-secret"
                  type="password"
                  bind:value={google.clientSecret}
                  placeholder={google.hasClientSecret ? t('admin.authClientSecretKeep', $locale) : ''}
                  autocomplete="new-password"
                />
              </div>
            </div>
            <p class="auth-settings-hint">
              {t('admin.authRedirectHint', $locale)}
              <code>{apiBase}/api/auth/oauth/google/callback</code>
            </p>
          </article>

          <article class="auth-provider-card">
            <div class="auth-provider-head">
              <h3>{t('admin.authMicrosoft', $locale)}</h3>
              <label class="auth-switch-row auth-switch-row--compact">
                <span>{t('admin.authProviderEnabled', $locale)}</span>
                <span class="auth-switch">
                  <input type="checkbox" bind:checked={microsoft.enabled} />
                  <span class="auth-switch-slider"></span>
                </span>
              </label>
            </div>
            {#if microsoft.enabled && !microsoftShowOnLogin}
              <p class="auth-settings-warn">{t('admin.authOAuthNeedsCredentials', $locale)}</p>
            {/if}
            <div class="auth-provider-fields">
              <div>
                <label for="ms-client-id">{t('admin.authClientId', $locale)}</label>
                <input id="ms-client-id" bind:value={microsoft.clientId} autocomplete="off" />
              </div>
              <div>
                <label for="ms-client-secret">{t('admin.authClientSecret', $locale)}</label>
                <input
                  id="ms-client-secret"
                  type="password"
                  bind:value={microsoft.clientSecret}
                  placeholder={microsoft.hasClientSecret ? t('admin.authClientSecretKeep', $locale) : ''}
                  autocomplete="new-password"
                />
              </div>
              <div class="auth-provider-fields__full">
                <label for="ms-tenant">{t('admin.authTenantId', $locale)}</label>
                <input id="ms-tenant" bind:value={microsoft.tenantId} autocomplete="off" />
                <p class="auth-settings-hint">{t('admin.authTenantHint', $locale)}</p>
              </div>
            </div>
            <p class="auth-settings-hint">
              {t('admin.authRedirectHint', $locale)}
              <code>{apiBase}/api/auth/oauth/microsoft/callback</code>
            </p>
          </article>
        </div>
      </div>
    </section>

    <div class="auth-settings-actions">
      <button type="submit" class="btn btn-sm" disabled={saving}>
        {saving ? '...' : t('profile.save', $locale)}
      </button>
    </div>
  </form>
{/if}

<style>
  .auth-settings-form {
    max-width: 1040px;
    display: flex;
    flex-direction: column;
    gap: 1.125rem;
  }

  .auth-card {
    border-radius: var(--radius-xl);
  }

  .auth-card h2 {
    margin: 0 0 1rem;
    font-size: 1.0625rem;
    font-weight: 700;
  }

  .auth-settings-note {
    margin: -0.5rem 0 1rem;
    font-size: 0.8125rem;
    color: var(--color-muted);
    line-height: 1.5;
  }

  .auth-settings-warn {
    margin: 0 0 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-md);
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #b45309;
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .auth-provider-card h3 {
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .auth-switch-list {
    display: grid;
    gap: 0.625rem;
  }

  .auth-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: 0.875rem;
  }

  .auth-switch-row--compact {
    border: none;
    background: transparent;
    padding: 0;
    min-width: 180px;
    justify-content: flex-end;
  }

  .auth-switch {
    position: relative;
    display: inline-flex;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .auth-switch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }

  .auth-switch-slider {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--color-border);
    transition: background var(--duration-fast);
    position: relative;
  }

  .auth-switch-slider::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: transform var(--duration-fast);
  }

  .auth-switch input:checked + .auth-switch-slider {
    background: var(--color-primary);
  }

  .auth-switch input:checked + .auth-switch-slider::after {
    transform: translateX(20px);
  }

  .auth-settings-field label,
  .auth-provider-fields label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .auth-settings-field textarea,
  .auth-provider-fields input {
    width: 100%;
  }

  .auth-settings-hint {
    margin: 0.375rem 0 0;
    font-size: 0.75rem;
    color: var(--color-muted);
    line-height: 1.45;
  }

  .auth-settings-hint code {
    display: block;
    margin-top: 0.25rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-surface-hover);
    font-size: 0.6875rem;
    word-break: break-all;
  }

  .auth-providers-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .auth-provider-card {
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .auth-provider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .auth-provider-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem 0.875rem;
  }

  .auth-provider-fields__full {
    grid-column: 1 / -1;
  }

  .auth-settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem 1rem;
    margin-top: 0.75rem;
  }

  .auth-settings-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  @media (max-width: 900px) {
    .auth-providers-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 700px) {
    .auth-settings-grid,
    .auth-provider-fields {
      grid-template-columns: 1fr;
    }

    .auth-switch-row {
      align-items: flex-start;
    }

    .auth-provider-head {
      flex-direction: column;
      align-items: flex-start;
    }

    .auth-switch-row--compact {
      min-width: 0;
      width: 100%;
      justify-content: space-between;
    }
  }
</style>

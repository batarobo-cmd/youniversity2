<script lang="ts">
  import { dev } from '$app/environment';
  import { page } from '$app/state';
  import { locale } from '$lib/stores/auth';
  import { authErrorMessage, t } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';
  import LocaleMenu from '$lib/components/LocaleMenu.svelte';
  import RegisterManualForm from '$lib/components/RegisterManualForm.svelte';
  import '$lib/styles/login.css';

  let { data, form = null }: { data: PageData; form?: ActionData | null } = $props();

  let isRegister = $state(false);
  let manualDetailsOpen = $state(false);

  const authConfig = $derived(data.authConfig);
  const oauthGoogle = $derived(authConfig.oauth.google.enabled);
  const oauthMicrosoft = $derived(authConfig.oauth.microsoft.enabled);
  const hasOAuth = $derived(oauthGoogle || oauthMicrosoft);
  const registrationEnabled = $derived(authConfig.manualRegistrationEnabled);
  const turnstileSiteKey = $derived(authConfig.turnstileSiteKey ?? null);

  function toggleAuthMode() {
    isRegister = !isRegister;
    if (hasOAuth) manualDetailsOpen = true;
  }

  const error = $derived(
    authErrorMessage(
      form?.errorCode ?? page.url.searchParams.get('error'),
      form?.error,
      $locale,
    ),
  );
</script>

<svelte:head>
  {#if registrationEnabled && turnstileSiteKey}
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      async
      defer
    ></script>
  {/if}
</svelte:head>

<div class="login-page">
  <aside class="login-brand">
    <div class="login-brand-content">
      <h1>YOUniversity2</h1>
      <p>{t('auth.brandTagline', $locale)}</p>
      <div class="login-brand-features">
        <div class="login-brand-feature">
          <span class="login-brand-feature-icon">⚡</span>
          <span>{t('auth.featureRealtime', $locale)}</span>
        </div>
        <div class="login-brand-feature">
          <span class="login-brand-feature-icon">🌍</span>
          <span>{t('auth.featureI18n', $locale)}</span>
        </div>
        <div class="login-brand-feature">
          <span class="login-brand-feature-icon">🎓</span>
          <span>{t('auth.featureCourses', $locale)}</span>
        </div>
      </div>
    </div>
  </aside>

  <main class="login-panel">
    <div class="login-locale">
      <LocaleMenu />
    </div>

    <div class="login-card">
      <div class="login-card-header">
        <h2>
          {isRegister && registrationEnabled
            ? t('auth.registerWelcome', $locale)
            : t('auth.welcome', $locale)}
        </h2>
        <p>
          {isRegister && registrationEnabled
            ? t('auth.registerWelcomeSub', $locale)
            : t('auth.welcomeSub', $locale)}
        </p>
      </div>

      {#if error}
        <div class="login-error" role="alert">{error}</div>
      {/if}

      {#if hasOAuth}
        <div class="oauth-buttons">
          {#if oauthGoogle}
            <a href="/api/auth/oauth/google" class="oauth-btn oauth-btn-google">
              <span class="oauth-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </span>
              <span class="oauth-btn-label">{t('auth.google', $locale)}</span>
            </a>
          {/if}
          {#if oauthMicrosoft}
            <a href="/api/auth/oauth/microsoft" class="oauth-btn oauth-btn-microsoft">
              <span class="oauth-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 23 23" width="20" height="20">
                  <path fill="#f35325" d="M1 1h10v10H1z"/>
                  <path fill="#81bc06" d="M12 1h10v10H12z"/>
                  <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                  <path fill="#ffba08" d="M12 12h10v10H12z"/>
                </svg>
              </span>
              <span class="oauth-btn-label">{t('auth.microsoft', $locale)}</span>
            </a>
          {/if}
        </div>
      {/if}

      {#if hasOAuth}
        <details class="manual-login-details" bind:open={manualDetailsOpen}>
          <summary>
            {isRegister && registrationEnabled
              ? t('auth.manualRegister', $locale)
              : t('auth.manualLogin', $locale)}
          </summary>
          <div class="manual-login-body">
            {#if isRegister && registrationEnabled}
              <RegisterManualForm {turnstileSiteKey} />
            {:else}
              <form class="manual-form" method="POST" action="?/login">
                <div class="form-field">
                  <label for="email">{dev ? t('auth.loginId', $locale) : t('auth.email', $locale)}</label>
                  <input
                    id="email"
                    name="email"
                    type={dev ? 'text' : 'email'}
                    value={form?.email ?? ''}
                    autocomplete="username"
                    placeholder={dev ? 'admin' : ''}
                    required
                  />
                </div>
                <div class="form-field">
                  <label for="password">{t('auth.password', $locale)}</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    placeholder={dev ? 'admin' : ''}
                    required
                  />
                </div>
                <button type="submit" class="login-submit">
                  {t('auth.submit', $locale)}
                </button>
              </form>
            {/if}
          </div>
        </details>
      {:else}
        {#if isRegister && registrationEnabled}
          <RegisterManualForm {turnstileSiteKey} />
        {:else}
          <form class="manual-form" method="POST" action="?/login">
            <div class="form-field">
              <label for="email">{dev ? t('auth.loginId', $locale) : t('auth.email', $locale)}</label>
              <input
                id="email"
                name="email"
                type={dev ? 'text' : 'email'}
                value={form?.email ?? ''}
                autocomplete="username"
                placeholder={dev ? 'admin' : ''}
                required
              />
            </div>
            <div class="form-field">
              <label for="password">{t('auth.password', $locale)}</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder={dev ? 'admin' : ''}
                required
              />
            </div>
            <button type="submit" class="login-submit">
              {t('auth.submit', $locale)}
            </button>
          </form>
        {/if}
      {/if}

      {#if registrationEnabled}
        <div class="login-footer">
          <button type="button" class="login-footer-link" onclick={toggleAuthMode}>
            {isRegister ? t('auth.hasAccount', $locale) : t('auth.noAccount', $locale)}
          </button>
        </div>
      {/if}
    </div>
  </main>
</div>

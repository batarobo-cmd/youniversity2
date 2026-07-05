<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { ActionData } from './$types';
  import LocaleMenu from '$lib/components/LocaleMenu.svelte';
  import '$lib/styles/login.css';

  const OAUTH_ENABLED = false;

  let { form = null }: { form?: ActionData | null } = $props();

  let isRegister = $state(false);

  const error = $derived(form?.error ?? '');
</script>

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
        <h2>{t('auth.welcome', $locale)}</h2>
        <p>{t('auth.welcomeSub', $locale)}</p>
      </div>

      {#if error}
        <div class="login-error" role="alert">{error}</div>
      {/if}

      <div class="oauth-buttons oauth-buttons--preview">
        <button type="button" class="oauth-btn oauth-btn-google" disabled={!OAUTH_ENABLED}>
          {t('auth.google', $locale)}
          <span class="oauth-badge">{t('auth.oauthComingSoon', $locale)}</span>
        </button>
        <button type="button" class="oauth-btn oauth-btn-microsoft" disabled={!OAUTH_ENABLED}>
          {t('auth.microsoft', $locale)}
          <span class="oauth-badge">{t('auth.oauthComingSoon', $locale)}</span>
        </button>
      </div>

      <div class="login-divider">{t('auth.or', $locale)}</div>

      {#if isRegister}
        <form class="manual-form" method="POST" action="?/register">
          <div class="form-field">
            <label for="name">{t('auth.name', $locale)}</label>
            <input id="name" name="name" autocomplete="name" required />
          </div>
          <div class="form-field">
            <label for="email">{t('auth.email', $locale)}</label>
            <input id="email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="form-field">
            <label for="password">{t('auth.password', $locale)}</label>
            <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" />
          </div>
          <button type="submit" class="login-submit">
            {t('auth.register', $locale)}
          </button>
        </form>
      {:else}
        <form class="manual-form" method="POST" action="?/login">
          <div class="form-field">
            <label for="email">{t('auth.email', $locale)}</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form?.email ?? ''}
              autocomplete="email"
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
              required
            />
          </div>
          <button type="submit" class="login-submit">
            {t('auth.submit', $locale)}
          </button>
        </form>
      {/if}

      <div class="login-footer">
        <button type="button" onclick={() => (isRegister = !isRegister)}>
          {isRegister ? t('auth.hasAccount', $locale) : t('auth.noAccount', $locale)}
        </button>
      </div>
    </div>
  </main>
</div>

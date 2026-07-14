<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  let {
    turnstileSiteKey = null,
  }: {
    turnstileSiteKey?: string | null;
  } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let widgetId = $state<string | undefined>(undefined);
  let turnstileToken = $state('');

  onMount(() => {
    if (!turnstileSiteKey || !container) return;

    const render = () => {
      if (!container || !window.turnstile) return;
      widgetId = window.turnstile.render(container, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => {
          turnstileToken = token;
        },
        'expired-callback': () => {
          turnstileToken = '';
        },
        'error-callback': () => {
          turnstileToken = '';
        },
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      turnstileToken = '';
    };
  });
</script>

<form class="manual-form" method="POST" action="?/register">
  <div class="form-field">
    <label for="givenName">{t('auth.givenName', $locale)}</label>
    <input
      id="givenName"
      name="givenName"
      autocomplete="given-name"
      required
      minlength="1"
      maxlength="100"
    />
  </div>
  <div class="form-field">
    <label for="familyName">{t('auth.familyName', $locale)}</label>
    <input
      id="familyName"
      name="familyName"
      autocomplete="family-name"
      required
      minlength="1"
      maxlength="100"
    />
  </div>
  <div class="form-field">
    <label for="reg-email">{t('auth.email', $locale)}</label>
    <input id="reg-email" name="email" type="email" autocomplete="email" required maxlength="255" />
  </div>
  <div class="form-field">
    <label for="reg-password">{t('auth.password', $locale)}</label>
    <input
      id="reg-password"
      name="password"
      type="password"
      autocomplete="new-password"
      required
      minlength="8"
      maxlength="128"
    />
  </div>

  <!-- Honeypot for bots -->
  <div class="register-honeypot" aria-hidden="true">
    <label for="companyWebsite">Website</label>
    <input id="companyWebsite" name="companyWebsite" type="text" tabindex="-1" autocomplete="off" />
  </div>

  {#if turnstileSiteKey}
    <input type="hidden" name="turnstileToken" value={turnstileToken} />
    <div class="form-field register-captcha">
      <div bind:this={container}></div>
    </div>
  {/if}

  <button
    type="submit"
    class="login-submit"
    disabled={Boolean(turnstileSiteKey) && !turnstileToken}
  >
    {t('auth.register', $locale)}
  </button>
</form>

<style>
  .register-honeypot {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .register-captcha {
    display: flex;
    justify-content: center;
    margin-top: 0.25rem;
  }
</style>

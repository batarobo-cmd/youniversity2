<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  let {
    turnstileSiteKey = null,
  }: {
    turnstileSiteKey?: string | null;
  } = $props();

  let turnstileToken = $state('');
  let captchaReady = $state(!turnstileSiteKey);
  let captchaError = $state(false);

  function loadTurnstileScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-yo2-turnstile]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('turnstile script failed')), {
          once: true,
        });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.yo2Turnstile = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('turnstile script failed'));
      document.head.appendChild(script);
    });
  }

  type TurnstileMount = {
    siteKey: string;
    onToken: (token: string) => void;
    onReady: (ready: boolean) => void;
    onError: () => void;
  };

  function turnstileMount(node: HTMLElement, params: TurnstileMount) {
    let widgetId: string | undefined;
    let destroyed = false;

    async function mount() {
      params.onReady(false);
      params.onToken('');
      try {
        await loadTurnstileScript();
        if (destroyed || !window.turnstile) return;
        if (widgetId) {
          window.turnstile.remove(widgetId);
          widgetId = undefined;
        }
        widgetId = window.turnstile.render(node, {
          sitekey: params.siteKey,
          action: 'turnstile-spin-v2',
          callback: (token: string) => {
            params.onToken(token);
            params.onReady(Boolean(token?.trim()));
          },
          'expired-callback': () => {
            params.onToken('');
            params.onReady(false);
          },
          'error-callback': () => {
            params.onToken('');
            params.onReady(false);
            params.onError();
          },
        });
      } catch {
        params.onToken('');
        params.onReady(false);
        params.onError();
      }
    }

    void mount();

    return {
      update(next: TurnstileMount) {
        params = next;
        void mount();
      },
      destroy() {
        destroyed = true;
        if (widgetId && window.turnstile) {
          window.turnstile.remove(widgetId);
        }
      },
    };
  }
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

  <div class="register-honeypot" aria-hidden="true">
    <input id="companyWebsite" name="companyWebsite" type="text" tabindex="-1" autocomplete="off" />
  </div>

  {#if turnstileSiteKey}
    <input type="hidden" name="cf-turnstile-response" value={turnstileToken} />
    <div class="form-field register-captcha">
      <div
        class="register-captcha-mount"
        use:turnstileMount={{
          siteKey: turnstileSiteKey,
          onToken: (token) => {
            turnstileToken = token;
          },
          onReady: (ready) => {
            captchaReady = ready;
            if (ready) captchaError = false;
          },
          onError: () => {
            captchaError = true;
          },
        }}
      ></div>
      {#if captchaError}
        <p class="register-captcha-error" role="alert">
          {t('auth.captchaFailed', $locale)}
        </p>
      {/if}
    </div>
  {/if}

  <button type="submit" class="login-submit" disabled={Boolean(turnstileSiteKey) && !captchaReady}>
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
    opacity: 0;
    pointer-events: none;
  }

  .register-captcha {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .register-captcha-mount {
    min-height: 65px;
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .register-captcha-error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-danger, #dc2626);
    text-align: center;
  }
</style>

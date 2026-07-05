<script lang="ts">
  import { goto } from '$app/navigation';
  import { setAuth, locale } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';

  let email = $state('');
  let password = $state('');
  let name = $state('');
  let isRegister = $state(false);
  let error = $state('');
  let loading = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      const result = isRegister
        ? await api.register({ email, password, name, preferredLocale: $locale })
        : await api.login(email, password);

      setAuth(result.accessToken, result.user);
      goto('/courses');
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

<div style="max-width: 400px; margin: 3rem auto;">
  <div class="card">
    <h2 style="margin-bottom: 1.5rem;">{t('auth.login', $locale)}</h2>

    {#if error}
      <p style="color: var(--color-danger); margin-bottom: 1rem; font-size: 0.9rem;">{error}</p>
    {/if}

    <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 1rem;">
      {#if isRegister}
        <div>
          <label for="name">{t('auth.name', $locale)}</label>
          <input id="name" bind:value={name} required />
        </div>
      {/if}

      <div>
        <label for="email">{t('auth.email', $locale)}</label>
        <input id="email" type="email" bind:value={email} required />
      </div>

      <div>
        <label for="password">{t('auth.password', $locale)}</label>
        <input id="password" type="password" bind:value={password} required minlength="8" />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? '...' : isRegister ? t('auth.register', $locale) : t('auth.submit', $locale)}
      </button>
    </form>

    <p style="margin-top: 1rem; font-size: 0.85rem; color: var(--color-muted); text-align: center;">
      <button
        type="button"
        onclick={() => (isRegister = !isRegister)}
        style="background: none; border: none; color: var(--color-primary); padding: 0; cursor: pointer;"
      >
        {isRegister ? t('auth.submit', $locale) : t('auth.register', $locale)}
      </button>
    </p>
  </div>
</div>

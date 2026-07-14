<script lang="ts">
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import '$lib/styles/error-page.css';

  const status = $derived($page.status);
  const rawMessage = $derived($page.error?.message ?? '');

  const title = $derived.by(() => {
    if (status === 404) return t('error.notFoundTitle', $locale);
    if (status === 403) return t('error.forbiddenTitle', $locale);
    if (status >= 500) return t('error.serverTitle', $locale);
    return t('error.genericTitle', $locale);
  });

  const description = $derived.by(() => {
    if (status === 404) return t('error.notFound', $locale);
    if (status === 403) return t('error.forbidden', $locale);
    if (status >= 500) return t('error.server', $locale);
    return rawMessage || t('error.generic', $locale);
  });

  const isAuthRoute = $derived(
    $page.url.pathname === '/' ||
      $page.url.pathname === '/login' ||
      $page.url.pathname.startsWith('/auth/'),
  );

  const homeHref = $derived(isAuthRoute ? '/' : '/dashboard');

  async function retry() {
    await invalidateAll();
  }
</script>

<section class="error-page" class:error-page--auth={isAuthRoute}>
  <div class="error-page__card">
    <p class="error-page__code" aria-hidden="true">{status}</p>
    <h1 class="error-page__title">{title}</h1>
    <p class="error-page__message">{description}</p>
    <div class="error-page__actions">
      <button type="button" class="btn" onclick={retry}>{t('error.retry', $locale)}</button>
      <a href={homeHref} class="btn btn-ghost">{t('error.goHome', $locale)}</a>
    </div>
  </div>
</section>

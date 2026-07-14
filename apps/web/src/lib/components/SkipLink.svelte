<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  let { targetId = 'main-content' }: { targetId?: string } = $props();
</script>

<a href={`#${targetId}`} class="skip-link">{t('a11y.skipToContent', $locale)}</a>

<style>
  .skip-link {
    position: absolute;
    left: -9999px;
    top: 0.75rem;
    z-index: 10000;
    padding: 0.625rem 1rem;
    border-radius: var(--radius);
    background: var(--color-primary);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    box-shadow: var(--shadow-md);
  }

  .skip-link:focus {
    left: 0.75rem;
  }
</style>

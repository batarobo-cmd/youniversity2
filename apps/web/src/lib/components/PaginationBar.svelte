<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  let {
    page = $bindable(1),
    totalPages,
    total,
    pageSize,
  }: {
    page?: number;
    totalPages: number;
    total: number;
    pageSize: number;
  } = $props();

  const pageLocale = $derived($locale);
  const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
  const to = $derived(Math.min(page * pageSize, total));

  function goPrev() {
    if (page > 1) page -= 1;
  }

  function goNext() {
    if (page < totalPages) page += 1;
  }
</script>

<nav class="pagination-bar" aria-label={t('pagination.label', pageLocale)}>
  <span class="pagination-range">
    {t('pagination.range', pageLocale)
      .replace('{from}', String(from))
      .replace('{to}', String(to))
      .replace('{total}', String(total))}
  </span>
  <div class="pagination-controls">
    <button
      type="button"
      class="pagination-btn"
      disabled={page <= 1}
      aria-label={t('pagination.prev', pageLocale)}
      onclick={goPrev}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
    <span class="pagination-page">{page} / {totalPages}</span>
    <button
      type="button"
      class="pagination-btn"
      disabled={page >= totalPages}
      aria-label={t('pagination.next', pageLocale)}
      onclick={goNext}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</nav>

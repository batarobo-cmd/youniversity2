<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { focusTrap } from '$lib/actions/focus-trap';
  import ViewportPaginator from '$lib/components/ViewportPaginator.svelte';
  import {
    certificateDownloadFileName,
    certificateDownloadUrl,
    formatCertificateIssuedAt,
  } from '$lib/certificate-download';

  export type CertHistoryItem = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
  };

  let {
    open = false,
    courseTitle = '',
    certificates = [],
    listHeight = 320,
    onClose,
  }: {
    open?: boolean;
    courseTitle?: string;
    certificates?: CertHistoryItem[];
    listHeight?: number;
    onClose: () => void;
  } = $props();

  const titleId = 'cert-history-modal-title';

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('dash-cert-modal-overlay')) onClose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && onClose()} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="dash-cert-modal-overlay" role="presentation" onclick={handleBackdrop}>
    <div
      class="dash-cert-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      use:focusTrap={open}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="dash-cert-modal-head">
        <h3 id={titleId}>{t('dash.certificateHistory', $locale)} — {courseTitle}</h3>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          aria-label={t('a11y.close', $locale)}
          onclick={onClose}
        >
          {t('a11y.close', $locale)}
        </button>
      </div>
      <ViewportPaginator
        items={certificates}
        availableHeight={listHeight}
        rowHeight={52}
        minPageSize={3}
      >
        {#snippet children(pageItems)}
          <div class="dash-cert-modal-list">
            {#each pageItems as cert}
              <div class="dash-cert-modal-row">
                <span>#{cert.certificateNumber}</span>
                <span>{formatCertificateIssuedAt(cert.issuedAt, $locale)}</span>
                <a
                  class="btn btn-ghost btn-sm"
                  href={certificateDownloadUrl(cert.id)}
                  download={certificateDownloadFileName(cert.certificateNumber)}
                >
                  {t('dash.downloadCertificate', $locale)}
                </a>
              </div>
            {/each}
          </div>
        {/snippet}
      </ViewportPaginator>
    </div>
  </div>
{/if}

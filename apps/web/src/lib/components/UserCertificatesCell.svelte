<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { serverMutate } from '$lib/client/form-action';
  import {
    certificateDownloadFileName,
    certificateDownloadUrl,
    formatCertificateIssuedAt,
  } from '$lib/certificate-download';

  type UserCertificate = {
    id: string;
    certificateNumber: string;
    issuedAt: string;
    courseId: string;
    courseTitle: string;
  };

  type CourseCertificateGroup = {
    courseId: string;
    courseTitle: string;
    certificates: UserCertificate[];
    latestIssuedAt: number;
  };

  let {
    userId = '',
    userName = '',
    certificates = [],
  }: {
    userId?: string;
    userName?: string;
    certificates?: UserCertificate[];
  } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let popoverStyle = $state('');
  let expandedCourses = $state(new Set<string>());
  let localCertificates = $state<UserCertificate[]>([]);
  let deletingId = $state<string | null>(null);
  let deleteError = $state('');

  $effect(() => {
    localCertificates = [...certificates];
  });

  const groups = $derived.by(() => {
    const map = new Map<string, CourseCertificateGroup>();

    for (const cert of localCertificates) {
      const existing = map.get(cert.courseId);
      if (existing) {
        existing.certificates.push(cert);
      } else {
        map.set(cert.courseId, {
          courseId: cert.courseId,
          courseTitle: cert.courseTitle,
          certificates: [cert],
          latestIssuedAt: new Date(cert.issuedAt).getTime(),
        });
      }
    }

    for (const group of map.values()) {
      group.certificates.sort(
        (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
      );
      group.latestIssuedAt = new Date(group.certificates[0].issuedAt).getTime();
    }

    return [...map.values()].sort((a, b) => b.latestIssuedAt - a.latestIssuedAt);
  });

  function placePopover(anchor: HTMLElement | null | undefined) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 360;
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    popoverStyle = `top:${rect.bottom + 6}px;left:${Math.max(12, left)}px;width:${width}px;`;
  }

  function togglePopover(anchor?: HTMLElement | null) {
    if (!open) placePopover(anchor ?? rootEl?.querySelector('.users-cert-count'));
    open = !open;
    if (!open) {
      expandedCourses = new Set();
      deleteError = '';
    }
  }

  function closePopover() {
    open = false;
    expandedCourses = new Set();
    deleteError = '';
  }

  function toggleCourse(courseId: string) {
    const next = new Set(expandedCourses);
    if (next.has(courseId)) next.delete(courseId);
    else next.add(courseId);
    expandedCourses = next;
  }

  async function deleteCertificate(cert: UserCertificate) {
    const confirmMsg = t('admin.deleteCertificateConfirm', $locale).replace(
      '{number}',
      cert.certificateNumber,
    );
    if (!confirm(confirmMsg)) return;

    deletingId = cert.id;
    deleteError = '';
    try {
      await serverMutate(
        'apiMutation',
        `/api/courses/${cert.courseId}/reporting/${userId}/certificates/${cert.id}`,
        'DELETE',
      );
      localCertificates = localCertificates.filter((item) => item.id !== cert.id);
      if (localCertificates.length === 0) closePopover();
      await invalidate('admin:users');
    } catch (e) {
      deleteError = (e as Error).message;
    } finally {
      deletingId = null;
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) closePopover();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closePopover();
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

{#if localCertificates.length === 0}
  <span class="users-cell-empty">{t('admin.usersNoCertificates', $locale)}</span>
{:else}
  <div class="users-popover-cell" bind:this={rootEl}>
    <button
      type="button"
      class="users-cert-count"
      aria-expanded={open}
      aria-haspopup="dialog"
      onclick={(e) => togglePopover(e.currentTarget)}
      title={t('admin.usersCertificatesShowAll', $locale)}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3 2 8l10 5 10-5-10-5Z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
        />
        <path
          d="M6 11v4.5c0 1.8 2.7 3 6 3s6-1.2 6-3V11"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
        <path d="M22 8v5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
      </svg>
      <span>{t('admin.usersCertificatesCount', $locale, { count: localCertificates.length })}</span>
    </button>

    {#if open}
      <div
        class="users-popover users-popover--fixed users-popover--wide"
        style={popoverStyle}
        role="dialog"
        aria-label={t('admin.usersCertificatesPopover', $locale)}
      >
        <div class="users-popover-head">
          <div>
            <strong>{userName}</strong>
            <span>
              {t('admin.usersCertificatesSummary', $locale, {
                courses: groups.length,
                count: localCertificates.length,
              })}
            </span>
          </div>
          <button type="button" class="users-popover-close" onclick={closePopover} aria-label="Close">
            ×
          </button>
        </div>
        {#if deleteError}
          <div class="users-cert-delete-error">{deleteError}</div>
        {/if}
        <ul class="users-popover-list users-cert-groups">
          {#each groups as group (group.courseId)}
            <li class="users-cert-group">
              <button
                type="button"
                class="users-cert-group-trigger"
                aria-expanded={expandedCourses.has(group.courseId)}
                onclick={() => toggleCourse(group.courseId)}
              >
                <svg
                  class="users-cert-group-chevron"
                  class:users-cert-group-chevron--open={expandedCourses.has(group.courseId)}
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="users-cert-group-title">{group.courseTitle}</span>
                <span class="users-cert-group-count">
                  {t('admin.usersCertificatesPerCourse', $locale, { count: group.certificates.length })}
                </span>
              </button>

              {#if expandedCourses.has(group.courseId)}
                <ul class="users-cert-group-list">
                  {#each group.certificates as cert, index (cert.id)}
                    <li>
                      <div class="users-cert-row">
                        <div class="users-cert-row-meta">
                          <span class="users-cert-row-id">
                            #{cert.certificateNumber}
                            {#if index === 0}
                              <span class="users-cert-row-latest">{t('admin.reportingCertLatest', $locale)}</span>
                            {/if}
                          </span>
                          <span class="users-cert-row-date">
                            {formatCertificateIssuedAt(cert.issuedAt, $locale)}
                          </span>
                        </div>
                        <div class="users-cert-row-actions">
                          <a
                            class="users-cert-download"
                            href={certificateDownloadUrl(cert.id)}
                            download={certificateDownloadFileName(cert.certificateNumber)}
                            title={t('admin.downloadCertificate', $locale)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                                stroke="currentColor"
                                stroke-width="1.75"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                            </svg>
                          </a>
                          <button
                            type="button"
                            class="users-cert-delete"
                            title={t('admin.deleteCertificate', $locale)}
                            aria-label={t('admin.deleteCertificate', $locale)}
                            disabled={deletingId === cert.id}
                            onclick={() => deleteCertificate(cert)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M6 7h12M10 11v6M14 11v6M9 7V5h6v2"
                                stroke="currentColor"
                                stroke-width="1.75"
                                stroke-linecap="round"
                              />
                              <path
                                d="M8 7l1 12h6l1-12"
                                stroke="currentColor"
                                stroke-width="1.75"
                                stroke-linejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

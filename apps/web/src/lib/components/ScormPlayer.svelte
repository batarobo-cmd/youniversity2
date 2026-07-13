<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '$lib/api';
  import { token } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import type { Locale } from '@youniversity2/shared';
  import {
    applyScormCompletionMarkers,
    scormCmiIndicatesComplete,
  } from '@youniversity2/shared';
  import { prepareScormCmiForResume, type ScormLaunchConfig } from '$lib/scorm-config';

  export type ScormSessionState = {
    attemptId: string;
    cmi: Record<string, unknown>;
    iframeSrc: string;
    launchKey: string;
    launching: boolean;
    error: string;
  };

  let {
    locale,
    config,
    session = null,
    active = true,
    onCmiSaved,
    onCommitted,
  }: {
    locale: Locale;
    config: ScormLaunchConfig;
    session?: ScormSessionState | null;
    active?: boolean;
    onCmiSaved?: (cmi: Record<string, unknown>) => void;
    onCommitted?: (result: { isComplete?: boolean; percentComplete?: number }) => void;
  } = $props();

  const cmiData: Record<string, unknown> = {};
  let suspendInFlight: Promise<void> | null = null;
  let completionCommitInFlight: Promise<void> | null = null;
  let suspendPending = $state(false);
  let syncedAttemptId = $state<string | null>(null);
  let apiReadyForAttempt = $state<string | null>(null);
  let completionRecorded = $state(false);

  const sessionReady = $derived(Boolean(session?.attemptId && session?.iframeSrc && !session?.launching));
  const showIframe = $derived(
    sessionReady &&
      (active || suspendPending) &&
      apiReadyForAttempt === session?.attemptId,
  );

  type ScormApi = {
    GetLastError: () => string;
    GetErrorString: (code: string) => string;
    GetDiagnostic: (code: string) => string;
  };

  function makeScorm12ErrorApi(): ScormApi & {
    LMSGetLastError: () => string;
    LMSGetErrorString: (code: string) => string;
    LMSGetDiagnostic: (code: string) => string;
  } {
    return {
      GetLastError: () => '0',
      GetErrorString: (code) => (code === '0' ? 'No error' : 'Error'),
      GetDiagnostic: () => '',
      LMSGetLastError: () => '0',
      LMSGetErrorString: (code) => (code === '0' ? 'No error' : 'Error'),
      LMSGetDiagnostic: () => '',
    };
  }

  function makeScorm2004ErrorApi(): ScormApi {
    return {
      GetLastError: () => '0',
      GetErrorString: (code) => (code === '0' ? 'No error' : 'Error'),
      GetDiagnostic: () => '',
    };
  }

  function normalizeValue(v: unknown) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  }

  function notifyCmiSaved(cmi: Record<string, unknown>) {
    onCmiSaved?.({ ...cmi });
  }

  function buildSuspendCmi(terminated = false) {
    const cmi = { ...cmiData };
    if (!terminated) {
      if (config.version === 'scorm_12') {
        cmi['cmi.core.exit'] = 'suspend';
      } else {
        cmi['cmi.exit'] = 'suspend';
      }
    }
    return cmi;
  }

  async function commitCmi(
    attemptId: string,
    cmi: Record<string, unknown>,
    terminated: boolean,
  ) {
    const result = await api.scormCommit({
      attemptId,
      cmi,
      terminated,
    });
    Object.assign(cmiData, cmi);
    notifyCmiSaved(cmiData);
    if (result.derived?.isComplete) {
      completionRecorded = true;
    }
    onCommitted?.({
      isComplete: result.derived?.isComplete,
      percentComplete: result.derived?.percentComplete,
    });
    return result;
  }

  async function tryAutoComplete(attemptId: string, terminated = true) {
    if (completionRecorded || !scormCmiIndicatesComplete(config.version, cmiData)) return;

    const payload = { ...cmiData };
    applyScormCompletionMarkers(config.version, payload);

    if (completionCommitInFlight) {
      await completionCommitInFlight;
      return;
    }

    completionCommitInFlight = commitCmi(attemptId, payload, terminated).then(() => {}).finally(() => {
      completionCommitInFlight = null;
    });
    await completionCommitInFlight;
  }

  function installScormApis(cmi: Record<string, unknown>, currentAttemptId: string) {
    const scorm12Base = makeScorm12ErrorApi();
    const scorm2004Base = makeScorm2004ErrorApi();
    let initialized = false;
    let terminated = false;
    let commitInFlight: Promise<void> | null = null;

    function scheduleCommit(terminatedFlag = false) {
      if (commitInFlight) return;
      const payload = { ...cmi };
      const shouldTerminate =
        terminatedFlag || scormCmiIndicatesComplete(config.version, payload);
      if (shouldTerminate) {
        applyScormCompletionMarkers(config.version, payload);
      }
      commitInFlight = commitCmi(currentAttemptId, payload, shouldTerminate)
        .catch(() => {})
        .finally(() => {
          commitInFlight = null;
        });
    }

    function afterCmiMutation(element: string, value: string) {
      if (config.version === 'scorm_12' && element === 'cmi.core.lesson_status' && value === 'passed') {
        scheduleCommit(true);
        return;
      }
      if (config.version === 'scorm_2004' && element === 'cmi.success_status' && value === 'passed') {
        scheduleCommit(true);
        return;
      }
      void tryAutoComplete(currentAttemptId, true);
    }

    (window as any).API = {
      ...scorm12Base,
      LMSInitialize: (_: string) => {
        initialized = true;
        terminated = false;
        return 'true';
      },
      LMSFinish: (_: string) => {
        terminated = true;
        scheduleCommit(true);
        return 'true';
      },
      LMSGetValue: (element: string) => {
        if (!initialized || terminated) return '';
        return normalizeValue(cmi[element]);
      },
      LMSSetValue: (element: string, value: string) => {
        if (!initialized || terminated) return 'false';
        cmi[element] = value;
        notifyCmiSaved(cmi);
        afterCmiMutation(element, value);
        return 'true';
      },
      LMSCommit: (_: string) => {
        if (!initialized || terminated) return 'false';
        scheduleCommit(false);
        return 'true';
      },
    };

    (window as any).API_1484_11 = {
      ...scorm2004Base,
      Initialize: (_: string) => {
        initialized = true;
        terminated = false;
        return 'true';
      },
      Terminate: (_: string) => {
        terminated = true;
        scheduleCommit(true);
        return 'true';
      },
      GetValue: (element: string) => {
        if (!initialized || terminated) return '';
        return normalizeValue(cmi[element]);
      },
      SetValue: (element: string, value: string) => {
        if (!initialized || terminated) return 'false';
        cmi[element] = value;
        notifyCmiSaved(cmi);
        afterCmiMutation(element, value);
        return 'true';
      },
      Commit: (_: string) => {
        if (!initialized || terminated) return 'false';
        scheduleCommit(false);
        return 'true';
      },
    };
  }

  function syncCmiFromSession(next: ScormSessionState | null | undefined) {
    for (const k of Object.keys(cmiData)) delete cmiData[k];
    if (next?.cmi) {
      Object.assign(cmiData, prepareScormCmiForResume(config.version, next.cmi));
    }
  }

  async function suspendSession(terminated = false) {
    const id = untrack(() => session?.attemptId ?? syncedAttemptId);
    if (!id || !get(token)) return;

    const doCommit = async () => {
      try {
        const payload = buildSuspendCmi(terminated);
        const shouldTerminate =
          terminated || scormCmiIndicatesComplete(config.version, payload);
        if (shouldTerminate) {
          applyScormCompletionMarkers(config.version, payload);
        }
        await commitCmi(id, payload, shouldTerminate);
      } catch {
        // best effort
      }
    };

    if (suspendInFlight) {
      await suspendInFlight;
      if (terminated) await doCommit();
      return;
    }

    suspendInFlight = doCommit();
    try {
      await suspendInFlight;
    } finally {
      suspendInFlight = null;
    }
  }

  function commitKeepalive(terminated = false) {
    const id = untrack(() => session?.attemptId ?? syncedAttemptId);
    if (!id) return;
    const payload = buildSuspendCmi(terminated);
    if (scormCmiIndicatesComplete(config.version, payload)) {
      applyScormCompletionMarkers(config.version, payload);
    }
    api.scormCommitKeepalive({
      attemptId: id,
      cmi: payload,
      terminated: terminated || scormCmiIndicatesComplete(config.version, payload),
    });
  }

  $effect(() => {
    if (!browser || !sessionReady) {
      apiReadyForAttempt = null;
      return;
    }

    const nextSession = session;
    if (!nextSession?.attemptId) return;

    syncCmiFromSession(nextSession);
    syncedAttemptId = nextSession.attemptId;
    installScormApis(cmiData, nextSession.attemptId);
    apiReadyForAttempt = nextSession.attemptId;

    if (active) {
      void tryAutoComplete(nextSession.attemptId, true);
    }
  });

  $effect(() => {
    if (!browser || !active || !sessionReady || !session?.attemptId || completionRecorded) return;

    const attemptId = session.attemptId;
    const interval = setInterval(() => {
      void tryAutoComplete(attemptId, true);
    }, 3000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!browser || !sessionReady || !session?.attemptId) return;

    if (active) {
      suspendPending = false;
      return;
    }

    suspendPending = true;
    void suspendSession(false).finally(() => {
      suspendPending = false;
    });
  });

  $effect(() => {
    if (!browser) return;

    const onPageHide = () => {
      if (!active || !session?.attemptId) return;
      commitKeepalive(false);
    };

    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  });

  onDestroy(() => {
    if (active && session?.attemptId) {
      void suspendSession(false);
    }
  });
</script>

<div class="scorm-player" class:scorm-player--inactive={!active && !suspendPending}>
  {#if !active && !suspendPending}
    <!-- paused -->
  {:else if session?.error}
    <p class="video-source-error">{session.error}</p>
  {:else if !session || session.launching || !sessionReady}
    <p class="scorm-player-loading">{t('course.scormLoading', locale)}</p>
  {:else if showIframe}
    <iframe
      class="course-embed-iframe"
      src={session.iframeSrc}
      title="SCORM"
      style="width:100%; min-height: 70vh; border: 0; background: white;"
    ></iframe>
  {/if}
</div>

<style>
  .scorm-player--inactive {
    display: none;
  }

  .scorm-player-loading {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }
</style>

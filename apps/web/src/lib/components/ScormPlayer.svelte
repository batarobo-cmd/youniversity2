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
    scormCmiReadyToFinalize,
    scormPackageSignalsCompletionScreen,
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

  export type ScormFlushFn = (terminated?: boolean) => Promise<void>;

  let {
    locale,
    config,
    session = null,
    active = true,
    onCmiSaved,
    onCommitted,
    registerFlush,
  }: {
    locale: Locale;
    config: ScormLaunchConfig;
    session?: ScormSessionState | null;
    active?: boolean;
    onCmiSaved?: (cmi: Record<string, unknown>) => void;
    onCommitted?: (result: { isComplete?: boolean; percentComplete?: number }) => void;
    registerFlush?: (lessonId: string, flush: ScormFlushFn | null) => void;
  } = $props();

  const cmiData: Record<string, unknown> = {};
  let commitQueue: Promise<void> = Promise.resolve();
  let suspendInFlight: Promise<void> | null = null;
  let completionCommitInFlight: Promise<void> | null = null;
  let suspendPending = $state(false);
  let syncedAttemptId = $state<string | null>(null);
  let apiReadyForAttempt = $state<string | null>(null);
  let completionRecorded = $state(false);
  let scormApiInstalledFor: string | null = null;
  let packageCompletionHandled = false;
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let activeFinishAttemptId: string | null = null;

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

  function shouldTerminateSession(cmi: Record<string, unknown>) {
    return (
      scormCmiIndicatesComplete(config.version, cmi) ||
      scormCmiReadyToFinalize(config.version, cmi)
    );
  }

  async function waitForCommitQueue() {
    await commitQueue;
  }

  function enqueueCommit(task: () => Promise<void>) {
    commitQueue = commitQueue.then(task).catch(() => {});
    return commitQueue;
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

  function queueCmiCommit(attemptId: string, terminatedFlag = false) {
    enqueueCommit(async () => {
      const payload = { ...cmiData };
      const terminate = shouldTerminateSession(payload) || terminatedFlag;
      if (terminate) {
        applyScormCompletionMarkers(config.version, payload);
      }
      await commitCmi(attemptId, payload, terminate);
    });
  }

  async function tryAutoComplete(attemptId: string) {
    if (completionRecorded) return;
    const canFinalize =
      scormCmiIndicatesComplete(config.version, cmiData) ||
      scormCmiReadyToFinalize(config.version, cmiData);
    if (!canFinalize) return;

    const payload = { ...cmiData };
    applyScormCompletionMarkers(config.version, payload);

    if (completionCommitInFlight) {
      await completionCommitInFlight;
      return;
    }

    completionCommitInFlight = enqueueCommit(async () => {
      await commitCmi(attemptId, payload, true);
    }).finally(() => {
      completionCommitInFlight = null;
    });
    await completionCommitInFlight;
  }

  function readIframeText() {
    try {
      return iframeEl?.contentDocument?.body?.innerText ?? '';
    } catch {
      return '';
    }
  }

  function requestPackageExit() {
    const win = iframeEl?.contentWindow as (Window & Record<string, unknown>) | null;
    if (!win) return;
    for (const name of ['DoExit', 'doExit', 'DoClose', 'ClosePlayer', 'ExitActivity']) {
      const fn = win[name];
      if (typeof fn === 'function') {
        try {
          fn.call(win);
          return;
        } catch {
          // continue
        }
      }
    }
  }

  function invokeLmsFinish(attemptId: string) {
    queueCmiCommit(attemptId, true);
    void tryAutoComplete(attemptId);
  }

  function installStorylineParentHooks(attemptId: string) {
    activeFinishAttemptId = attemptId;
    const finish = () => {
      if (activeFinishAttemptId) invokeLmsFinish(activeFinishAttemptId);
    };
    const w = window as unknown as Record<string, unknown>;
    w.doLMSFinish = finish;
    w.doClose = finish;
    w.ExitActivity = finish;
    w.ExitCourse = finish;
  }

  function clearStorylineParentHooks() {
    activeFinishAttemptId = null;
    const w = window as unknown as Record<string, unknown>;
    for (const key of ['doLMSFinish', 'doClose', 'ExitActivity', 'ExitCourse']) {
      if (w[key] === undefined) continue;
      delete w[key];
    }
  }

  async function handlePackageCompletionScreen(attemptId: string) {
    if (completionRecorded || packageCompletionHandled) return;
    const iframeText = readIframeText();
    if (!scormPackageSignalsCompletionScreen(iframeText)) return;

    packageCompletionHandled = true;
    requestPackageExit();
    document.getElementById('scorm-exit-activity')?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    invokeLmsFinish(attemptId);
  }

  function installScormApis(currentAttemptId: string) {
    const scorm12Base = makeScorm12ErrorApi();
    const scorm2004Base = makeScorm2004ErrorApi();
    let initialized = false;
    let terminated = false;

    function afterCmiMutation(element: string, value: string) {
      if (config.version === 'scorm_12' && element === 'cmi.core.lesson_status' && value === 'passed') {
        queueCmiCommit(currentAttemptId, true);
        return;
      }
      if (config.version === 'scorm_12' && element === 'cmi.core.lesson_status' && value === 'completed') {
        queueCmiCommit(currentAttemptId, false);
        void tryAutoComplete(currentAttemptId);
        return;
      }
      if (config.version === 'scorm_2004' && element === 'cmi.success_status' && value === 'passed') {
        queueCmiCommit(currentAttemptId, true);
        return;
      }
      if (
        element === 'cmi.core.lesson_location' ||
        element === 'cmi.location' ||
        element === 'cmi.suspend_data'
      ) {
        queueCmiCommit(currentAttemptId, false);
        void tryAutoComplete(currentAttemptId);
        return;
      }
      void tryAutoComplete(currentAttemptId);
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
        queueCmiCommit(currentAttemptId, true);
        return 'true';
      },
      LMSGetValue: (element: string) => {
        if (!initialized || terminated) return '';
        return normalizeValue(cmiData[element]);
      },
      LMSSetValue: (element: string, value: string) => {
        if (!initialized || terminated) return 'false';
        cmiData[element] = value;
        notifyCmiSaved(cmiData);
        afterCmiMutation(element, value);
        return 'true';
      },
      LMSCommit: (_: string) => {
        if (!initialized || terminated) return 'false';
        queueCmiCommit(currentAttemptId, false);
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
        queueCmiCommit(currentAttemptId, true);
        return 'true';
      },
      GetValue: (element: string) => {
        if (!initialized || terminated) return '';
        return normalizeValue(cmiData[element]);
      },
      SetValue: (element: string, value: string) => {
        if (!initialized || terminated) return 'false';
        cmiData[element] = value;
        notifyCmiSaved(cmiData);
        afterCmiMutation(element, value);
        return 'true';
      },
      Commit: (_: string) => {
        if (!initialized || terminated) return 'false';
        queueCmiCommit(currentAttemptId, false);
        return 'true';
      },
    };

    installStorylineParentHooks(currentAttemptId);
  }

  function syncCmiFromSession(next: ScormSessionState | null | undefined) {
    for (const k of Object.keys(cmiData)) delete cmiData[k];
    if (next?.cmi) {
      Object.assign(cmiData, prepareScormCmiForResume(config.version, next.cmi));
    }
  }

  async function flushProgress(terminated = false) {
    const id = untrack(() => session?.attemptId ?? syncedAttemptId);
    if (!id || !get(token)) return;

    await waitForCommitQueue();
    await suspendSession(terminated);
    await waitForCommitQueue();
  }

  async function suspendSession(terminated = false) {
    const id = untrack(() => session?.attemptId ?? syncedAttemptId);
    if (!id || !get(token)) return;

    const doCommit = async () => {
      try {
        await waitForCommitQueue();
        const payload = buildSuspendCmi(terminated);
        const terminate = shouldTerminateSession(payload) || terminated;
        if (terminate) {
          applyScormCompletionMarkers(config.version, payload);
        }
        await commitCmi(id, payload, terminate);
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
    const terminate = shouldTerminateSession(payload) || terminated;
    if (terminate) {
      applyScormCompletionMarkers(config.version, payload);
    }
    api.scormCommitKeepalive({
      attemptId: id,
      cmi: payload,
      terminated: terminate,
    });
  }

  $effect(() => {
    if (!browser || !sessionReady || !session?.attemptId) {
      apiReadyForAttempt = null;
      return;
    }

    const attemptId = session.attemptId;
    if (attemptId !== syncedAttemptId) {
      syncCmiFromSession(session);
      syncedAttemptId = attemptId;
      completionRecorded = false;
      packageCompletionHandled = false;
      commitQueue = Promise.resolve();
    }

    if (scormApiInstalledFor !== attemptId) {
      installScormApis(attemptId);
      scormApiInstalledFor = attemptId;
    } else {
      installStorylineParentHooks(attemptId);
    }

    apiReadyForAttempt = attemptId;
    registerFlush?.(config.lessonId, flushProgress);

    if (active) {
      void tryAutoComplete(attemptId);
    }

    return () => {
      registerFlush?.(config.lessonId, null);
    };
  });

  $effect(() => {
    if (!browser || !active || !sessionReady || !session?.attemptId || completionRecorded) return;

    const attemptId = session.attemptId;
    const interval = setInterval(() => {
      void handlePackageCompletionScreen(attemptId);
      void tryAutoComplete(attemptId);
    }, 2000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!browser || !sessionReady || !session?.attemptId) return;

    if (active) {
      suspendPending = false;
      return;
    }

    suspendPending = true;
    void flushProgress(false).finally(() => {
      suspendPending = false;
    });
  });

  $effect(() => {
    if (!browser) return;

    const onPageHide = () => {
      if (!active || !session?.attemptId) return;
      void waitForCommitQueue().then(() => commitKeepalive(false));
    };

    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  });

  onDestroy(() => {
    registerFlush?.(config.lessonId, null);
    clearStorylineParentHooks();
    if (active && session?.attemptId) {
      void flushProgress(false);
    }
  });
</script>

<div class="scorm-player" class:scorm-player--inactive={!active && !suspendPending}>
  <!-- Hidden hook for Articulate/Storyline packages that look for an LMS exit target (not shown in UI). -->
  <a
    id="scorm-exit-activity"
    href="#"
    class="scorm-exit-hook"
    aria-hidden="true"
    tabindex="-1"
    onclick={(e) => {
      e.preventDefault();
      if (syncedAttemptId) invokeLmsFinish(syncedAttemptId);
    }}
  >
    Exit
  </a>
  {#if !active && !suspendPending}
    <!-- paused -->
  {:else if session?.error}
    <p class="video-source-error">{session.error}</p>
  {:else if !session || session.launching || !sessionReady}
    <p class="scorm-player-loading">{t('course.scormLoading', locale)}</p>
  {:else if showIframe}
    <iframe
      bind:this={iframeEl}
      class="course-embed-iframe scorm-player-iframe"
      src={session.iframeSrc}
      title="SCORM"
    ></iframe>
  {/if}
</div>

<style>
  .scorm-player {
    position: relative;
  }

  .scorm-exit-hook {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .scorm-player--inactive {
    display: none;
  }

  .scorm-player-loading {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .scorm-player-iframe {
    width: 100%;
    min-height: 70vh;
    border: 0;
    border-radius: var(--radius-lg);
    box-shadow: inset 0 0 0 1px var(--color-border);
    /* SCORM balíky väčšinou počítajú so svetlým plátnom */
    background: #fff;
  }
</style>

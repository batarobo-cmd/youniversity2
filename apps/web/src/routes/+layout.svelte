<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { token, setAuth, syncSessionFromServer, clearAuth, user as authUser, syncStudentViewFromServer } from '$lib/stores/auth';
  import { connectWebSocket, disconnectWebSocket, startHeartbeat, stopHeartbeat } from '$lib/stores/realtime';
  import { initActivityTracker, trackPageView } from '$lib/activity-tracker';
  import { api } from '$lib/api';
  import AppShell from '$lib/components/AppShell.svelte';
  import type { LayoutData } from './$types';
  import type { User } from '@youniversity2/shared';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  function isAuthRoute(pathname: string) {
    return pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/');
  }

  const authPage = $derived(isAuthRoute($page.url.pathname));

  let wsStarted = $state(false);
  let studentViewHydrated = $state(false);

  $effect(() => {
    if (!browser || !authPage) return;
    clearAuth();
    wsStarted = false;
    studentViewHydrated = false;
  });

  /** Sync auth hneď po načítaní layout dát (pred interakciou). */
  $effect.pre(() => {
    if (!browser || authPage) return;
    const sessionToken = data.token;
    if (!sessionToken) return;

    syncSessionFromServer(sessionToken);
    if (!studentViewHydrated) {
      syncStudentViewFromServer(Boolean(data.studentViewMode));
      studentViewHydrated = true;
    }
    if (data.user) {
      setAuth(sessionToken, data.user as User);
    }
  });

  /** Ak server nevrátil user, doplníme cez API. */
  $effect(() => {
    if (!browser || authPage || data.user || !data.token) return;
    void api
      .getMe(data.token)
      .then((u) => setAuth(data.token!, u))
      .catch(() => {});
  });

  $effect(() => {
    const sessionToken = $token ?? data.token;
    if (!browser || authPage || wsStarted || !sessionToken) return;
    wsStarted = true;

    initActivityTracker();
    connectWebSocket(sessionToken);
    startHeartbeat();

    const unsub = token.subscribe((t) => {
      if (t) connectWebSocket();
      else disconnectWebSocket();
    });

    return () => {
      unsub();
      disconnectWebSocket();
      stopHeartbeat();
    };
  });

  $effect(() => {
    const sessionToken = $token ?? data.token;
    if (!browser || authPage || !sessionToken) return;
    trackPageView($page.url.pathname);
  });
</script>

{#if authPage}
  {@render children()}
{:else}
  <AppShell user={$authUser ?? data.user} appVersion={data.appVersion}>
    <div class="page-enter">
      {@render children()}
    </div>
  </AppShell>
{/if}

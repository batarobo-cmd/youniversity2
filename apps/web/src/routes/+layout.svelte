<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { token, setAuth, syncSessionFromServer, clearAuth } from '$lib/stores/auth';
  import { connectWebSocket, disconnectWebSocket, startHeartbeat, stopHeartbeat } from '$lib/stores/realtime';
  import { api } from '$lib/api';
  import AppShell from '$lib/components/AppShell.svelte';
  import type { LayoutData } from './$types';
  import type { User } from '@youniversity2/shared';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  function isAuthRoute(pathname: string) {
    return pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/');
  }

  const authPage = $derived(isAuthRoute($page.url.pathname));

  let synced = $state(false);

  $effect(() => {
    if (!browser || !authPage) return;
    clearAuth();
    synced = false;
  });

  $effect(() => {
    if (!browser || synced || !data.token) return;
    synced = true;

    syncSessionFromServer(data.token);
    if (data.user) {
      setAuth(data.token, data.user as User);
    } else {
      api
        .getMe(data.token)
        .then((u) => setAuth(data.token!, u))
        .catch(() => {
          /* API nedostupné — profil sa zobrazí s fallbackom */
        });
    }

    connectWebSocket();
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
</script>

{#if authPage}
  {@render children()}
{:else}
  <AppShell serverUser={data.user}>
    <div class="page-enter">
      {@render children()}
    </div>
  </AppShell>
{/if}

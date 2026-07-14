<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { onNavigate } from '$app/navigation';
  import { navigating, page } from '$app/stores';
  import { token, setAuth, syncSessionFromServer, clearAuth, user as authUser, syncStudentViewFromServer, locale } from '$lib/stores/auth';
  import { initTheme } from '$lib/stores/theme';
  import { connectWebSocket, disconnectWebSocket, startHeartbeat, stopHeartbeat } from '$lib/stores/realtime';
  import { initActivityTracker, trackPageView } from '$lib/activity-tracker';
  import { api } from '$lib/api';
  import AppShell from '$lib/components/AppShell.svelte';
  import PageSkeleton from '$lib/components/PageSkeleton.svelte';
  import SystemAdminPasswordPrompt from '$lib/components/SystemAdminPasswordPrompt.svelte';
  import type { LayoutData } from './$types';
  import type { User } from '@youniversity2/shared';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  function isAuthRoute(pathname: string) {
    return pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/');
  }

  const authPage = $derived(isAuthRoute($page.url.pathname));

  type SkeletonVariant = 'dashboard' | 'course' | 'list' | 'generic';

  function skeletonForPath(pathname: string): SkeletonVariant {
    if (pathname.startsWith('/courses/')) return 'course';
    if (pathname === '/courses') return 'list';
    if (pathname.startsWith('/dashboard')) return 'dashboard';
    return 'generic';
  }

  const navigatingTo = $derived($navigating?.to?.url.pathname ?? null);
  const navSkeletonVariant = $derived(
    skeletonForPath(navigatingTo ?? $page.url.pathname),
  );
  const showNavSkeleton = $derived(Boolean($navigating));

  let wsStarted = $state(false);
  let studentViewHydrated = $state(false);

  $effect(() => {
    if (!browser) return;
    document.documentElement.lang = $locale;
  });

  if (browser) {
    onNavigate((navigation) => {
      if (!document.startViewTransition) return;
      return new Promise((resolve) => {
        document.startViewTransition(async () => {
          resolve();
          await navigation.complete;
        });
      });
    });
  }

  $effect(() => {
    if (!browser) return;
    return initTheme();
  });

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
  {#if showNavSkeleton}
    <PageSkeleton variant="generic" />
  {:else}
    {@render children()}
  {/if}
{:else}
  <AppShell user={$authUser ?? data.user} appVersion={data.appVersion} systemFeatures={data.systemFeatures}>
    {#if showNavSkeleton}
      <PageSkeleton variant={navSkeletonVariant} />
    {:else}
      <div class="page-enter">
        {@render children()}
      </div>
    {/if}
    <SystemAdminPasswordPrompt />
  </AppShell>
{/if}

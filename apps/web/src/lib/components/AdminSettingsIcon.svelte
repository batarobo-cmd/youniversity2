<script lang="ts">
  import type { AdminNavIcon } from '$lib/admin-nav';

  let { icon }: { icon: AdminNavIcon } = $props();
</script>

{#if icon === 'settings'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if icon === 'courses'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 6.5A2.5 2.5 0 016.5 4H20v16H6.5A2.5 2.5 0 004 17.5v-11z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else if icon === 'users'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.75" />
    <path
      d="M3 19c0-3.314 2.686-5 6-5s6 1.686 6 5"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
    />
    <path d="M16 11h5M18.5 8.5v5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else if icon === 'auth'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3l7 4v5c0 4.418-3.134 8.083-7 9-3.866-.917-7-4.582-7-9V7l7-4z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else if icon === 'system'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.75" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.75" />
    <path d="M7 7h.01M7 17h.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  </svg>
{:else if icon === 'contentBank'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    <circle cx="17" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" />
  </svg>
{:else if icon === 'email'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75" />
    <path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else if icon === 'branding'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3c-1.5 2.5-4 4-4 7a4 4 0 008 0c0-3-2.5-4.5-4-7z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <circle cx="8" cy="18" r="2" stroke="currentColor" stroke-width="1.75" />
    <circle cx="16" cy="18" r="2" stroke="currentColor" stroke-width="1.75" />
    <path d="M10 18h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{:else if icon === 'reporting'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    <path
      d="M8 17V11M12 17V7M16 17v-4"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
    />
  </svg>
{:else if icon === 'privacy'}
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
  </svg>
{/if}

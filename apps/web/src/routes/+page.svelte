<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';

  onMount(() => {
    const unsub = isAuthenticated.subscribe((auth) => {
      if (auth) goto('/courses');
    });
    return unsub;
  });
</script>

<div style="text-align: center; padding: 4rem 1rem;">
  <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">YOUniversity2</h1>
  <p style="color: var(--color-muted); margin-bottom: 2rem;">Realtime Learning Management System</p>
  <a href="/login" class="btn">Prihlásiť sa</a>
</div>

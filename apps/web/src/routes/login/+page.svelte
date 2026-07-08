<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  onMount(() => {
    const error = page.url.searchParams.get('error');
    goto(error ? `/?error=${encodeURIComponent(error)}` : '/');
  });
</script>

<script lang="ts">
  /** Avatar s podporou OAuth fotky (Google / M365) cez `avatarUrl`. */
  let {
    name = '',
    avatarUrl = undefined,
    size = 'md',
    title = name,
  }: {
    name?: string;
    avatarUrl?: string | null;
    size?: 'sm' | 'md' | 'lg';
    title?: string;
  } = $props();

  let imgError = $state(false);

  const initials = $derived(
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  );

  const showImage = $derived(Boolean(avatarUrl && !imgError));
</script>

<span class="user-avatar user-avatar--{size}" {title}>
  {#if showImage}
    <img
      src={avatarUrl}
      alt=""
      referrerpolicy="no-referrer"
      onerror={() => (imgError = true)}
    />
  {:else}
    <span class="user-avatar-fallback" aria-hidden="true">{initials}</span>
  {/if}
</span>

<style>
  .user-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;
    background: var(--gradient-brand);
    box-shadow: 0 0 0 1px var(--color-border);
  }

  .user-avatar--sm {
    width: 28px;
    height: 28px;
    font-size: 0.625rem;
  }

  .user-avatar--md {
    width: 36px;
    height: 36px;
    font-size: 0.75rem;
  }

  .user-avatar--lg {
    width: 72px;
    height: 72px;
    font-size: 1.25rem;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-weight: 700;
    color: white;
    letter-spacing: 0.02em;
  }
</style>

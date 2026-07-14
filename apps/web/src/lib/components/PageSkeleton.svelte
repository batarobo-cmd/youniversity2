<script lang="ts">
  type SkeletonVariant = 'dashboard' | 'course' | 'list' | 'generic' | 'table' | 'tree' | 'inline';

  let {
    variant = 'generic',
    ariaLabel = 'Loading',
  }: {
    variant?: SkeletonVariant;
    ariaLabel?: string;
  } = $props();
</script>

<div class="page-skeleton page-skeleton--{variant}" aria-busy="true" aria-label={ariaLabel}>
  {#if variant === 'dashboard'}
    <div class="page-skeleton__welcome">
      <div class="skeleton page-skeleton__line page-skeleton__line--title"></div>
      <div class="skeleton page-skeleton__line page-skeleton__line--sub"></div>
    </div>
    <div class="page-skeleton__stats">
      {#each Array(4) as _, i (i)}
        <div class="skeleton page-skeleton__stat"></div>
      {/each}
    </div>
    <div class="page-skeleton__grid">
      <div class="skeleton page-skeleton__panel page-skeleton__panel--main"></div>
      <div class="skeleton page-skeleton__panel page-skeleton__panel--side"></div>
    </div>
  {:else if variant === 'course'}
    <div class="page-skeleton__course">
      <div class="skeleton page-skeleton__course-sidebar"></div>
      <div class="skeleton page-skeleton__course-main"></div>
    </div>
  {:else if variant === 'list'}
    <div class="page-skeleton__welcome">
      <div class="skeleton page-skeleton__line page-skeleton__line--title"></div>
      <div class="skeleton page-skeleton__line page-skeleton__line--sub"></div>
    </div>
    <div class="page-skeleton__cards">
      {#each Array(3) as _, i (i)}
        <div class="skeleton page-skeleton__card"></div>
      {/each}
    </div>
  {:else if variant === 'table'}
    <div class="page-skeleton__welcome">
      <div class="skeleton page-skeleton__line page-skeleton__line--title"></div>
      <div class="skeleton page-skeleton__line page-skeleton__line--sub"></div>
    </div>
    <div class="page-skeleton__table">
      <div class="skeleton page-skeleton__table-header"></div>
      {#each Array(6) as _, i (i)}
        <div class="skeleton page-skeleton__table-row"></div>
      {/each}
    </div>
  {:else if variant === 'tree'}
    <div class="page-skeleton__welcome">
      <div class="skeleton page-skeleton__line page-skeleton__line--title"></div>
      <div class="skeleton page-skeleton__line page-skeleton__line--sub"></div>
    </div>
    <div class="page-skeleton__tree">
      {#each Array(6) as _, i (i)}
        <div
          class="skeleton page-skeleton__tree-row"
          style:margin-left="{i % 3 === 1 ? '1.25rem' : i % 3 === 2 ? '2.5rem' : '0'}"
        ></div>
      {/each}
    </div>
  {:else if variant === 'inline'}
    <div class="page-skeleton__inline">
      {#each Array(4) as _, i (i)}
        <div class="skeleton page-skeleton__inline-row"></div>
      {/each}
    </div>
  {:else}
    <div class="page-skeleton__generic">
      <div class="skeleton page-skeleton__line page-skeleton__line--title"></div>
      <div class="skeleton page-skeleton__line"></div>
      <div class="skeleton page-skeleton__line"></div>
      <div class="skeleton page-skeleton__line page-skeleton__line--short"></div>
    </div>
  {/if}
</div>

<style>
  .page-skeleton {
    animation: fadeIn 180ms var(--ease-out) both;
  }

  .page-skeleton__welcome {
    margin-bottom: 2rem;
  }

  .page-skeleton__line {
    height: 1rem;
    margin-bottom: 0.625rem;
  }

  .page-skeleton__line--title {
    height: 1.75rem;
    width: min(320px, 70%);
  }

  .page-skeleton__line--sub {
    width: min(420px, 85%);
  }

  .page-skeleton__line--short {
    width: 45%;
  }

  .page-skeleton__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.875rem;
    margin-bottom: 2rem;
  }

  .page-skeleton__stat {
    height: 96px;
    border-radius: var(--radius-lg);
  }

  .page-skeleton__grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 1.25rem;
  }

  .page-skeleton__panel {
    border-radius: var(--radius-lg);
  }

  .page-skeleton__panel--main {
    height: 420px;
  }

  .page-skeleton__panel--side {
    height: 320px;
  }

  .page-skeleton__course {
    display: grid;
    grid-template-columns: minmax(240px, 320px) 1fr;
    gap: 1.25rem;
    min-height: 70vh;
  }

  .page-skeleton__course-sidebar,
  .page-skeleton__course-main {
    border-radius: var(--radius-lg);
    min-height: 480px;
  }

  .page-skeleton__cards {
    display: grid;
    gap: 1rem;
  }

  .page-skeleton__card {
    height: 120px;
    border-radius: var(--radius-lg);
  }

  .page-skeleton__table {
    display: grid;
    gap: 0.625rem;
  }

  .page-skeleton__table-header {
    height: 2.5rem;
    border-radius: var(--radius-lg);
  }

  .page-skeleton__table-row {
    height: 4.5rem;
    border-radius: var(--radius);
  }

  .page-skeleton__tree {
    display: grid;
    gap: 0.625rem;
  }

  .page-skeleton__tree-row {
    height: 3rem;
    border-radius: var(--radius);
  }

  .page-skeleton__inline {
    display: grid;
    gap: 0.5rem;
  }

  .page-skeleton__inline-row {
    height: 2.75rem;
    border-radius: var(--radius);
  }

  .page-skeleton__generic {
    max-width: 560px;
  }

  @media (max-width: 900px) {
    .page-skeleton__grid {
      grid-template-columns: 1fr;
    }

    .page-skeleton__course {
      grid-template-columns: 1fr;
    }
  }
</style>

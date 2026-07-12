<script lang="ts">
  import { onMount } from 'svelte';
  import {
    computeViewportPageSize,
    paginateSlice,
    totalPagesFor,
  } from '$lib/viewport-pagination';
  import PaginationBar from '$lib/components/PaginationBar.svelte';
  import '$lib/styles/pagination.css';

  let {
    items,
    rowHeight = 72,
    headerOffset = 300,
    footerReserved = 150,
    minPageSize = 3,
    maxPageSize = 25,
    resetKey = '',
    availableHeight = null as number | null,
    children,
  }: {
    items: unknown[];
    rowHeight?: number;
    headerOffset?: number;
    footerReserved?: number;
    minPageSize?: number;
    maxPageSize?: number;
    resetKey?: string | number;
    availableHeight?: number | null;
    children: import('svelte').Snippet<[unknown[]]>;
  } = $props();

  let page = $state(1);
  let pageSize = $state(8);
  let viewportHeight = $state(0);

  function recalc() {
    if (availableHeight != null) {
      if (availableHeight <= 0) return;
      pageSize = computeViewportPageSize({
        availableHeight,
        rowHeight,
        min: minPageSize,
        max: maxPageSize,
      });
      return;
    }
    if (viewportHeight <= 0) return;
    pageSize = computeViewportPageSize({
      viewportHeight,
      headerOffset,
      footerReserved,
      rowHeight,
      min: minPageSize,
      max: maxPageSize,
    });
  }

  const totalPages = $derived(totalPagesFor(items.length, pageSize));
  const pageItems = $derived(paginateSlice(items, page, pageSize));

  $effect(() => {
    resetKey;
    items.length;
    page = 1;
  });

  $effect(() => {
    if (page > totalPages) page = totalPages;
  });

  $effect(() => {
    availableHeight;
    recalc();
  });

  onMount(() => {
    viewportHeight = window.innerHeight;
    recalc();
    const onResize = () => {
      viewportHeight = window.innerHeight;
      recalc();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<div class="viewport-paginator">
  {@render children(pageItems)}
  {#if items.length > pageSize}
    <PaginationBar bind:page {totalPages} total={items.length} {pageSize} />
  {/if}
</div>

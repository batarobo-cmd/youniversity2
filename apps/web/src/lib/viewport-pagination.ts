export type PageSizeOptions = {
  /** Full viewport height (page layouts). */
  viewportHeight?: number;
  /** Pre-measured list area height (modals). */
  availableHeight?: number;
  /** Space above the table (header, toolbar, titles). */
  headerOffset?: number;
  /** Space below the table (pagination, footer, padding). */
  footerReserved?: number;
  rowHeight: number;
  min?: number;
  max?: number;
};

export function computeViewportPageSize(options: PageSizeOptions): number {
  const {
    viewportHeight = 0,
    availableHeight,
    headerOffset = 0,
    footerReserved = 0,
    rowHeight,
    min = 3,
    max = 30,
  } = options;
  const available =
    availableHeight != null
      ? availableHeight - 52
      : viewportHeight - headerOffset - footerReserved;
  const raw = Math.floor(available / rowHeight);
  return Math.max(min, Math.min(max, raw));
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0 || items.length === 0) return [];
  const safePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(items.length / pageSize))));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPagesFor(count: number, pageSize: number): number {
  if (count === 0 || pageSize <= 0) return 1;
  return Math.ceil(count / pageSize);
}

/** Position a floating menu; flips above trigger when needed. */
export function floatingMenuStyle(
  trigger: HTMLElement,
  menuHeightEstimate = 220,
): string {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUp = spaceBelow < menuHeightEstimate + 12 && spaceAbove > spaceBelow;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));

  if (openUp) {
    const bottom = window.innerHeight - rect.top + 6;
    return `position:fixed;left:${left}px;bottom:${bottom}px;min-width:${Math.max(rect.width, 220)}px;`;
  }
  return `position:fixed;left:${left}px;top:${rect.bottom + 6}px;min-width:${Math.max(rect.width, 220)}px;`;
}

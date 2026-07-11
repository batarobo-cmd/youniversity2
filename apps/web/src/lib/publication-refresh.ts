export function collectUpcomingPublicationMs(
  dashboard: Record<string, unknown>,
  now = Date.now(),
): number[] {
  const times = new Set<number>();

  for (const event of (dashboard.calendarEvents as Array<{ date?: string }> | undefined) ?? []) {
    if (!event.date) continue;
    const ms = new Date(event.date).getTime();
    if (Number.isFinite(ms) && ms > now) times.add(ms);
  }

  for (const period of (dashboard.calendarPeriods as Array<{ startsAt?: string; endsAt?: string | null }> | undefined) ??
    []) {
    for (const iso of [period.startsAt, period.endsAt]) {
      if (!iso) continue;
      const ms = new Date(iso).getTime();
      if (Number.isFinite(ms) && ms > now) times.add(ms);
    }
  }

  return [...times].sort((a, b) => a - b);
}

export function scheduleNextPublicationRefresh(
  dashboard: Record<string, unknown> | null | undefined,
  onRefresh: () => void,
): () => void {
  if (!dashboard) return () => {};

  const upcoming = collectUpcomingPublicationMs(dashboard);
  const next = upcoming[0];
  if (!next) return () => {};

  const delay = Math.max(0, next - Date.now()) + 1500;
  const timer = setTimeout(onRefresh, delay);
  return () => clearTimeout(timer);
}

<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  interface CalendarEvent {
    id: string;
    courseId: string;
    title: string;
    date: string;
    type: 'start' | 'end' | 'deadline';
  }

  interface Props {
    events: CalendarEvent[];
  }

  let { events }: Props = $props();

  const now = new Date();
  let viewYear = $state(now.getFullYear());
  let viewMonth = $state(now.getMonth());

  const dayNames = $derived(
    $locale === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'],
  );

  const monthLabel = $derived(
    new Date(viewYear, viewMonth).toLocaleDateString($locale === 'en' ? 'en' : 'sk', {
      month: 'long',
      year: 'numeric',
    }),
  );

  const calendarDays = $derived.by(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const days: Array<{ day: number | null; events: CalendarEvent[] }> = [];
    for (let i = 0; i < startDay; i++) days.push({ day: null, events: [] });

    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter((e) => e.date.slice(0, 10) === dateStr);
      days.push({ day: d, events: dayEvents });
    }
    return days;
  });

  function prevMonth() {
    if (viewMonth === 0) {
      viewMonth = 11;
      viewYear--;
    } else viewMonth--;
  }

  function nextMonth() {
    if (viewMonth === 11) {
      viewMonth = 0;
      viewYear++;
    } else viewMonth++;
  }

  function isToday(day: number) {
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
  }
</script>

<div>
  <div class="calendar-nav">
    <button type="button" class="calendar-nav-btn" onclick={prevMonth}>‹</button>
    <span class="calendar-month-label">{monthLabel}</span>
    <button type="button" class="calendar-nav-btn" onclick={nextMonth}>›</button>
  </div>

  <div class="calendar">
    {#each dayNames as name}
      <div class="calendar-header">{name}</div>
    {/each}
    {#each calendarDays as cell}
      {#if cell.day === null}
        <div></div>
      {:else}
        <div
          class="calendar-day"
          class:today={isToday(cell.day)}
          class:has-event={cell.events.length > 0}
          title={cell.events.map((e) => e.title).join(', ')}
        >
          {cell.day}
          {#if cell.events.length > 0}
            <span class="calendar-day-dot" class:end={cell.events.some((e) => e.type === 'end')}></span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if events.length > 0}
    <div class="calendar-legend">
      <span class="calendar-legend-item">
        <span class="calendar-day-dot"></span>
        {t('dash.eventStart', $locale)}
      </span>
      <span class="calendar-legend-item">
        <span class="calendar-day-dot end"></span>
        {t('dash.eventEnd', $locale)}
      </span>
    </div>
  {/if}
</div>

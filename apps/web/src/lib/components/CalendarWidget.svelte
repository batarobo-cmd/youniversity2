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

  interface CalendarPeriod {
    id: string;
    courseId: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
  }

  type PeriodOnDay = CalendarPeriod & {
    colorIndex: number;
    isStart: boolean;
    isEnd: boolean;
  };

  interface Props {
    events: CalendarEvent[];
    periods?: CalendarPeriod[];
  }

  let { events, periods = [] }: Props = $props();

  const now = new Date();
  let viewYear = $state(now.getFullYear());
  let viewMonth = $state(now.getMonth());
  let tooltip = $state<{ lines: string[]; x: number; y: number } | null>(null);

  const periodColorMap = $derived(
    new Map(
      [...new Set([...periods.map((period) => period.courseId), ...events.map((event) => event.courseId)])].map(
        (courseId, index) => [courseId, index % 5],
      ),
    ),
  );

  const dayNames = $derived(
    $locale === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'],
  );

  const monthLabel = $derived(
    new Date(viewYear, viewMonth).toLocaleDateString($locale === 'en' ? 'en' : 'sk', {
      month: 'long',
      year: 'numeric',
    }),
  );

  function dayKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function periodsForDay(year: number, month: number, day: number): PeriodOnDay[] {
    const key = dayKey(year, month, day);
    return periods
      .filter((period) => {
        const startKey = period.startsAt.slice(0, 10);
        if (!period.endsAt) return false;
        const endKey = period.endsAt.slice(0, 10);
        return key >= startKey && key <= endKey;
      })
      .map((period) => ({
        ...period,
        colorIndex: periodColorMap.get(period.courseId) ?? 0,
        isStart: period.startsAt.slice(0, 10) === key,
        isEnd: period.endsAt?.slice(0, 10) === key,
      }))
      .sort((a, b) => a.colorIndex - b.colorIndex);
  }

  function eventMarkersForDay(
    dateKey: string,
    dayPeriods: PeriodOnDay[],
    dayEvents: CalendarEvent[],
  ) {
    return dayEvents
      .filter((event) => event.type === 'start' || event.type === 'end')
      .filter((event) => {
        const coveredByPeriod = dayPeriods.some(
          (period) =>
            period.courseId === event.courseId &&
            ((event.type === 'start' && period.isStart) || (event.type === 'end' && period.isEnd)),
        );
        return !coveredByPeriod;
      })
      .map((event) => ({
        ...event,
        colorIndex: periodColorMap.get(event.courseId) ?? 0,
      }))
      .sort((a, b) => a.colorIndex - b.colorIndex);
  }

  const calendarDays = $derived.by(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const days: Array<{
      day: number | null;
      dateKey: string;
      events: CalendarEvent[];
      periods: PeriodOnDay[];
      eventMarkers: ReturnType<typeof eventMarkersForDay>;
    }> = [];

    for (let i = 0; i < startDay; i++) {
      days.push({ day: null, dateKey: '', events: [], periods: [], eventMarkers: [] });
    }

    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = dayKey(viewYear, viewMonth, d);
      const dayPeriods = periodsForDay(viewYear, viewMonth, d);
      const dayEvents = events.filter((event) => event.date.slice(0, 10) === dateStr);
      days.push({
        day: d,
        dateKey: dateStr,
        events: dayEvents,
        periods: dayPeriods,
        eventMarkers: eventMarkersForDay(dateStr, dayPeriods, dayEvents),
      });
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

  function tooltipLines(cell: {
    day: number;
    dateKey: string;
    events: CalendarEvent[];
    periods: PeriodOnDay[];
  }) {
    const lines: string[] = [];
    if (isToday(cell.day)) {
      lines.push(t('dash.today', $locale));
    }

    for (const event of cell.events) {
      if (event.type === 'start') {
        lines.push(t('dash.courseStarts', $locale).replace('{title}', event.title));
      } else if (event.type === 'end') {
        lines.push(t('dash.courseEnds', $locale).replace('{title}', event.title));
      }
    }

    for (const period of cell.periods) {
      if (period.isStart && period.isEnd) {
        lines.push(t('dash.courseStartsAndEnds', $locale).replace('{title}', period.title));
      } else if (period.isStart) {
        if (!cell.events.some((event) => event.type === 'start' && event.courseId === period.courseId)) {
          lines.push(t('dash.courseStarts', $locale).replace('{title}', period.title));
        }
      } else if (period.isEnd) {
        if (!cell.events.some((event) => event.type === 'end' && event.courseId === period.courseId)) {
          lines.push(t('dash.courseEnds', $locale).replace('{title}', period.title));
        }
      } else {
        lines.push(t('dash.courseRunning', $locale).replace('{title}', period.title));
      }
    }

    return [...new Set(lines)];
  }

  function showTooltip(event: MouseEvent, lines: string[]) {
    if (lines.length === 0) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    tooltip = {
      lines,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    };
  }

  function hideTooltip() {
    tooltip = null;
  }

  function barTooltip(period: PeriodOnDay) {
    if (period.isStart && period.isEnd) {
      return t('dash.courseStartsAndEnds', $locale).replace('{title}', period.title);
    }
    if (period.isStart) {
      return t('dash.courseStarts', $locale).replace('{title}', period.title);
    }
    if (period.isEnd) {
      return t('dash.courseEnds', $locale).replace('{title}', period.title);
    }
    return t('dash.courseRunning', $locale).replace('{title}', period.title);
  }
</script>

<div class="calendar-widget" onmouseleave={hideTooltip}>
  <div class="calendar-nav">
    <button type="button" class="calendar-nav-btn" onclick={prevMonth} aria-label="Previous month">‹</button>
    <span class="calendar-month-label">{monthLabel}</span>
    <button type="button" class="calendar-nav-btn" onclick={nextMonth} aria-label="Next month">›</button>
  </div>

  <div class="calendar">
    {#each dayNames as name}
      <div class="calendar-header">{name}</div>
    {/each}
    {#each calendarDays as cell}
      {#if cell.day === null}
        <div class="calendar-day calendar-day--empty"></div>
      {:else}
        {@const lines = tooltipLines(cell)}
        <div
          class="calendar-day"
          class:today={isToday(cell.day)}
          class:has-courses={cell.periods.length > 0 || cell.eventMarkers.length > 0}
          role="gridcell"
          aria-current={isToday(cell.day) ? 'date' : undefined}
          onmouseenter={(event) => showTooltip(event, lines)}
          onmouseleave={hideTooltip}
        >
          <div class="calendar-day-top">
            <span class="calendar-day-number">{cell.day}</span>
            {#if isToday(cell.day)}
              <span class="calendar-day-today-label">{t('dash.todayShort', $locale)}</span>
            {/if}
          </div>

          {#if cell.periods.length > 0 || cell.eventMarkers.length > 0}
            <div class="calendar-day-bars" aria-hidden="true">
              {#each cell.periods.slice(0, 5) as period (period.id)}
                <span
                  class="calendar-day-bar"
                  class:calendar-day-bar--start={period.isStart}
                  class:calendar-day-bar--end={period.isEnd}
                  data-color={period.colorIndex}
                  title={barTooltip(period)}
                >
                  {#if period.isStart}
                    <span class="calendar-bar-cap calendar-bar-cap--start" aria-hidden="true"></span>
                  {/if}
                  <span class="calendar-day-bar-track"></span>
                  {#if period.isEnd}
                    <span class="calendar-bar-cap calendar-bar-cap--end" aria-hidden="true"></span>
                  {/if}
                </span>
              {/each}
              {#each cell.eventMarkers.slice(0, Math.max(0, 5 - cell.periods.length)) as marker (marker.id)}
                <span
                  class="calendar-day-bar calendar-day-bar--event-only"
                  class:calendar-day-bar--start={marker.type === 'start'}
                  class:calendar-day-bar--end={marker.type === 'end'}
                  data-color={marker.colorIndex}
                  title={marker.type === 'start'
                    ? t('dash.courseStarts', $locale).replace('{title}', marker.title)
                    : t('dash.courseEnds', $locale).replace('{title}', marker.title)}
                >
                  {#if marker.type === 'start'}
                    <span class="calendar-bar-cap calendar-bar-cap--start" aria-hidden="true"></span>
                  {:else}
                    <span class="calendar-bar-cap calendar-bar-cap--end" aria-hidden="true"></span>
                  {/if}
                </span>
              {/each}
              {#if cell.periods.length + cell.eventMarkers.length > 5}
                <span class="calendar-day-bar-more">+{cell.periods.length + cell.eventMarkers.length - 5}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if tooltip}
    <div class="calendar-tooltip" style="left: {tooltip.x}px; top: {tooltip.y}px;">
      {#each tooltip.lines as line}
        <div>{line}</div>
      {/each}
    </div>
  {/if}

  {#if events.length > 0 || periods.length > 0}
    <div class="calendar-legend">
      <span class="calendar-legend-item">
        <span class="calendar-legend-today"></span>
        {t('dash.today', $locale)}
      </span>
      <span class="calendar-legend-item">
        <span class="calendar-day-bar calendar-legend-bar" data-color="0">
          <span class="calendar-day-bar-track"></span>
        </span>
        {t('dash.courseAvailabilityPeriod', $locale)}
      </span>
      <span class="calendar-legend-item">
        <span class="calendar-bar-cap calendar-bar-cap--start calendar-legend-cap"></span>
        {t('dash.eventStart', $locale)}
      </span>
      <span class="calendar-legend-item">
        <span class="calendar-bar-cap calendar-bar-cap--end calendar-legend-cap"></span>
        {t('dash.eventEnd', $locale)}
      </span>
    </div>
  {/if}
</div>

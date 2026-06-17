import type {
  PlannerCalendar,
  PlannerEvent,
} from "../../api/contracts";
import { useMemo } from "react";

type SelectedDayAgendaProps = {
  selectedDate: string;
  events: PlannerEvent[];
  calendars: PlannerCalendar[];
  onEventClick: (event: PlannerEvent) => void;
  onCreateEvent: () => void;
};

const fallbackCalendarColor = "#6C63E8";
const selectedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});

function toLocalDateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSelectedDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);

  return selectedDateFormatter.format(date);
}

function formatEventTime(
  event: PlannerEvent,
  selectedDate: string,
): string {
  if (event.isAllDay) {
    return "All day";
  }

  const start = new Date(event.startUtc);
  const end = new Date(event.endUtc);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);
  const startsBeforeSelectedDay =
    toLocalDateValue(start) < selectedDate;
  const endsAfterSelectedDay = toLocalDateValue(end) > selectedDate;

  if (startsBeforeSelectedDay && endsAfterSelectedDay) {
    return `Continues from ${weekdayFormatter.format(
      start,
    )}, ${startTime} - Continues ${weekdayFormatter.format(
      end,
    )}, ${endTime}`;
  }
  if (startsBeforeSelectedDay) {
    return `Continues from ${weekdayFormatter.format(
      start,
    )}, ${startTime} - ${endTime}`;
  }
  if (endsAfterSelectedDay) {
    return `${startTime} - Continues ${weekdayFormatter.format(
      end,
    )}, ${endTime}`;
  }
  return `${startTime} - ${endTime}`;
}

export function SelectedDayAgenda({
  selectedDate,
  events,
  calendars,
  onEventClick,
  onCreateEvent,
}: SelectedDayAgendaProps) {
  const calendarsById = useMemo(
    () =>
      new Map(
        calendars.map((calendar) => [calendar.calendarId, calendar]),
      ),
    [calendars],
  );
  const agendaRows = useMemo(
    () =>
      events.map((event) => {
        const calendar = calendarsById.get(event.calendarId);
        return {
          event,
          calendarName: calendar?.name ?? "Unknown calendar",
          color: calendar?.colorHex ?? fallbackCalendarColor,
          time: formatEventTime(event, selectedDate),
        };
      }),
    [calendarsById, events, selectedDate],
  );

  return (
    <aside
      aria-label="Selected day agenda"
      className="selected-day-agenda"
    >
      <h2>{formatSelectedDate(selectedDate)}</h2>

      {events.length === 0 ? (
        <div className="selected-day-agenda__empty">
          <p>No events for this day.</p>
          <button
            className="button--primary selected-day-agenda__create"
            onClick={onCreateEvent}
            type="button"
          >
            Create event
          </button>
        </div>
      ) : (
        <ul className="selected-day-agenda__events">
          {agendaRows.map(({ event, calendarName, color, time }) => {
            return (
              <li key={event.eventId}>
                <button
                  className="selected-day-agenda__event"
                  onClick={() => onEventClick(event)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="selected-day-agenda__color"
                    data-testid={`agenda-color-${event.eventId}`}
                    style={{
                      backgroundColor: color,
                    }}
                  />
                  <span className="selected-day-agenda__title">
                    {event.title}
                  </span>
                  <span className="selected-day-agenda__time">
                    {time}
                  </span>
                  <span className="selected-day-agenda__calendar">
                    {calendarName}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

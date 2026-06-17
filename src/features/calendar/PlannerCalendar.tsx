import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarView } from "./useCalendarView";

type PlannerCalendarProps = {
  view: CalendarView;
  events: EventInput[];
  loading: boolean;
  onViewChange: (view: CalendarView) => void;
  onDateClick: (arg: DateClickArg) => void;
  onSelect: (arg: DateSelectArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onEventDrop: (arg: EventDropArg) => void;
  onEventResize: (arg: EventResizeDoneArg) => void;
  onCreate: () => void;
  onDatesSet: (arg: DatesSetArg) => void;
};

const viewOptions: Array<{
  view: CalendarView;
  label: string;
}> = [
  { view: "dayGridMonth", label: "Month" },
  { view: "timeGridWeek", label: "Week" },
  { view: "timeGridDay", label: "Day" },
];

function isCalendarView(value: string): value is CalendarView {
  return viewOptions.some((option) => option.view === value);
}

export function PlannerCalendar({
  view,
  events,
  loading,
  onViewChange,
  onDateClick,
  onSelect,
  onEventClick,
  onEventDrop,
  onEventResize,
  onCreate,
  onDatesSet,
}: PlannerCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("Calendar");

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api && api.view.type !== view) {
      api.changeView(view);
    }
  }, [view]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setTitle(arg.view.title);
      onDatesSet(arg);

      if (isCalendarView(arg.view.type) && arg.view.type !== view) {
        onViewChange(arg.view.type);
      }
    },
    [onDatesSet, onViewChange, view],
  );

  const changeView = (nextView: CalendarView) => {
    const api = calendarRef.current?.getApi();
    if (api && api.view.type !== nextView) {
      api.changeView(nextView);
    }
  };

  return (
    <section aria-label="Planner calendar" className="planner-calendar">
      <div className="planner-calendar__toolbar">
        <div aria-label="Calendar navigation" role="group">
          <button
            aria-label="Previous"
            onClick={() => calendarRef.current?.getApi().prev()}
            type="button"
          >
            Previous
          </button>
          <button
            aria-label="Today"
            onClick={() => calendarRef.current?.getApi().today()}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Next"
            onClick={() => calendarRef.current?.getApi().next()}
            type="button"
          >
            Next
          </button>
        </div>

        <h2 aria-live="polite">{title}</h2>

        <div aria-label="Calendar view" role="group">
          {viewOptions.map((option) => (
            <button
              aria-label={option.label}
              aria-pressed={view === option.view}
              key={option.view}
              onClick={() => changeView(option.view)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          aria-label="Create event"
          className="button--primary planner-calendar__create"
          onClick={onCreate}
          type="button"
        >
          Create event
        </button>
      </div>

      {loading ? (
        <div aria-live="polite" role="status">
          Loading calendar data
        </div>
      ) : null}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={view}
        headerToolbar={false}
        editable
        selectable
        selectMirror
        nowIndicator
        dayMaxEvents
        slotDuration="00:30:00"
        snapDuration="00:30:00"
        events={events}
        datesSet={handleDatesSet}
        dateClick={onDateClick}
        select={onSelect}
        eventClick={onEventClick}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        height="100%"
      />
    </section>
  );
}

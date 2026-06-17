import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import { useQueryClient } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PlannerEvent } from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { useNotice } from "../../shared/notices/NoticeProvider";
import { EventDialog, type EventSelection } from "../events/EventDialog";
import {
  EventInteractionBusyError,
  isEventInteractionPending,
  persistEventInteraction,
} from "../events/eventInteraction";
import { normalizeEventMutationError } from "../events/eventMutations";
import { getAgendaEvents } from "./agenda";
import { useCalendars, useEvents, type CalendarRange } from "./calendarQueries";
import { localDateTimeToUtc } from "./dateMapping";
import { toFullCalendarEvent } from "./eventMapping";
import { PlannerCalendar } from "./PlannerCalendar";
import { SelectedDayAgenda } from "./SelectedDayAgenda";
import { useCalendarVisibility } from "./useCalendarVisibility";
import { useCalendarView } from "./useCalendarView";

type CalendarPageProps = {
  api: PlannerApi;
  userId: string;
};

type MobileTab = "calendar" | "agenda";

type EditorState =
  | {
      mode: "create";
      selection: EventSelection;
    }
  | {
      mode: "edit";
      event: PlannerEvent;
    }
  | null;

function toLocalDateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CalendarPage({ api, userId }: CalendarPageProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotice();
  const [view, setView] = useCalendarView();
  const [visibleRange, setVisibleRange] = useState<CalendarRange>();
  const [selectedDate, setSelectedDate] = useState(() =>
    toLocalDateValue(new Date()),
  );
  const [activeMobileTab, setActiveMobileTab] =
    useState<MobileTab>("calendar");
  const calendarTabRef = useRef<HTMLButtonElement>(null);
  const agendaTabRef = useRef<HTMLButtonElement>(null);
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [calendarSurfaceRevision, setCalendarSurfaceRevision] =
    useState(0);
  const mountedRef = useRef(true);
  const calendarSurfaceRevisionWaiters = useRef<
    Array<() => void>
  >([]);
  const calendarsQuery = useCalendars(api, userId);
  const eventsQuery = useEvents(api, userId, visibleRange);
  const calendars = useMemo(
    () => calendarsQuery.data ?? [],
    [calendarsQuery.data],
  );
  const calendarIds = useMemo(
    () => calendars.map((calendar) => calendar.calendarId),
    [calendars],
  );
  const { visibleIds, toggle: toggleCalendar } =
    useCalendarVisibility(calendarIds);

  const drainCalendarSurfaceRevisionWaiters = useCallback(() => {
    const waiters = calendarSurfaceRevisionWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve());
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;

    return () => {
      if (!mountedRef.current) {
        return;
      }
      mountedRef.current = false;
      drainCalendarSurfaceRevisionWaiters();
    };
  }, [drainCalendarSurfaceRevisionWaiters]);

  useLayoutEffect(() => {
    drainCalendarSurfaceRevisionWaiters();
  }, [
    calendarSurfaceRevision,
    drainCalendarSurfaceRevisionWaiters,
  ]);

  const remountCalendarSurface = useCallback(
    () => {
      if (!mountedRef.current) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        calendarSurfaceRevisionWaiters.current.push(resolve);
        setCalendarSurfaceRevision((current) => current + 1);
      });
    },
    [],
  );

  const events = useMemo(() => {
    const calendarsById = new Map(
      calendars.map((calendar) => [calendar.calendarId, calendar]),
    );

    return (eventsQuery.data ?? []).flatMap((event) => {
      if (!visibleIds.has(event.calendarId)) {
        return [];
      }
      const calendar = calendarsById.get(event.calendarId);
      return calendar ? [toFullCalendarEvent(event, calendar)] : [];
    });
  }, [calendars, eventsQuery.data, visibleIds]);

  const agendaEvents = useMemo(
    () =>
      getAgendaEvents(
        eventsQuery.data ?? [],
        selectedDate,
        visibleIds,
      ),
    [eventsQuery.data, selectedDate, visibleIds],
  );

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const nextRange = {
      startUtc: arg.start.toISOString(),
      endUtc: arg.end.toISOString(),
    };
    const rangeStartDate = toLocalDateValue(arg.start);
    const currentStart =
      arg.view.currentStart instanceof Date &&
      !Number.isNaN(arg.view.currentStart.getTime())
        ? arg.view.currentStart
        : arg.start;
    const currentEnd =
      arg.view.currentEnd instanceof Date &&
      !Number.isNaN(arg.view.currentEnd.getTime())
        ? arg.view.currentEnd
        : arg.end;
    const currentStartDate = toLocalDateValue(currentStart);
    const currentEndDate = toLocalDateValue(currentEnd);

    setVisibleRange((currentRange) =>
      currentRange?.startUtc === nextRange.startUtc &&
      currentRange.endUtc === nextRange.endUtc
        ? currentRange
        : nextRange,
    );
    setSelectedDate((currentDate) => {
      if (
        currentDate >= currentStartDate &&
        currentDate < currentEndDate
      ) {
        return currentDate;
      }

      return currentStartDate;
    });
  }, []);

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setSelectedDate(arg.dateStr.slice(0, 10));
  }, []);

  const handleSelect = useCallback((arg: DateSelectArg) => {
    setSelectedDate(arg.startStr.slice(0, 10));
    setEditorState({
      mode: "create",
      selection: {
        startUtc: arg.allDay
          ? `${arg.startStr.slice(0, 10)}T00:00:00.000Z`
          : arg.start.toISOString(),
        endUtc: arg.allDay
          ? `${arg.endStr.slice(0, 10)}T00:00:00.000Z`
          : arg.end.toISOString(),
        allDay: arg.allDay,
      },
    });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const plannerEvent = arg.event.extendedProps.plannerEvent as
      | PlannerEvent
      | undefined;
    if (
      plannerEvent &&
      !isEventInteractionPending(plannerEvent.eventId)
    ) {
      setSelectedDate(
        plannerEvent.isAllDay
          ? plannerEvent.startUtc.slice(0, 10)
          : toLocalDateValue(new Date(plannerEvent.startUtc)),
      );
      setEditorState({ mode: "edit", event: plannerEvent });
    }
  }, []);

  const handleCreate = useCallback(() => {
    setEditorState({
      mode: "create",
      selection: {
        startUtc: localDateTimeToUtc(`${selectedDate}T09:00`),
        endUtc: localDateTimeToUtc(`${selectedDate}T10:00`),
        allDay: false,
      },
    });
  }, [selectedDate]);

  const handleAgendaEventClick = useCallback((event: PlannerEvent) => {
    if (!isEventInteractionPending(event.eventId)) {
      setEditorState({ mode: "edit", event });
    }
  }, []);

  const activateMobileTab = useCallback(
    (tab: MobileTab, moveFocus = false) => {
      setActiveMobileTab(tab);
      if (moveFocus) {
        const targetRef =
          tab === "calendar" ? calendarTabRef : agendaTabRef;
        targetRef.current?.focus();
      }
    },
    [],
  );

  const handleMobileTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tab: MobileTab) => {
      let nextTab: MobileTab | undefined;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowLeft":
          nextTab = tab === "calendar" ? "agenda" : "calendar";
          break;
        case "Home":
          nextTab = "calendar";
          break;
        case "End":
          nextTab = "agenda";
          break;
      }

      if (nextTab) {
        event.preventDefault();
        activateMobileTab(nextTab, true);
      }
    },
    [activateMobileTab],
  );

  const persistInteraction = useCallback(
    async (
      arg: Pick<EventDropArg, "event" | "revert">,
    ) => {
      try {
        await persistEventInteraction({
          event: arg.event,
          revert: arg.revert,
          update: (eventId, input) =>
            api.updateEvent(eventId, input),
          reconcile: async () => {
            try {
              await queryClient.invalidateQueries({
                queryKey: ["events", userId],
              });
            } finally {
              await remountCalendarSurface();
            }
          },
        });
      } catch (error) {
        if (error instanceof EventInteractionBusyError) {
          return;
        }
        if (mountedRef.current) {
          notify(normalizeEventMutationError(error), "error");
        }
      }
    },
    [api, notify, queryClient, remountCalendarSurface, userId],
  );

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      void persistInteraction(arg);
    },
    [persistInteraction],
  );

  const handleEventResize = useCallback(
    (arg: EventResizeDoneArg) => {
      void persistInteraction(arg);
    },
    [persistInteraction],
  );

  const loading = calendarsQuery.isLoading || eventsQuery.isLoading;

  return (
    <section className="route-page route-page--calendar">
      <h1>Calendar</h1>

      {calendarsQuery.isLoading ? (
        <p aria-live="polite" role="status">
          Loading calendars
        </p>
      ) : null}
      {calendarsQuery.isError ? (
        <p role="alert">Unable to load calendars.</p>
      ) : null}
      {calendarsQuery.isSuccess && calendars.length === 0 ? (
        <p>No calendars available.</p>
      ) : null}
      {eventsQuery.isError ? (
        <p role="alert">Unable to load calendar events.</p>
      ) : null}

      <div
        aria-label="Calendar and agenda"
        className="calendar-page__mobile-tabs"
        role="tablist"
      >
        <button
          aria-controls="calendar-mobile-pane"
          aria-selected={activeMobileTab === "calendar"}
          id="calendar-mobile-tab"
          onClick={() => activateMobileTab("calendar")}
          onKeyDown={(event) =>
            handleMobileTabKeyDown(event, "calendar")
          }
          ref={calendarTabRef}
          role="tab"
          tabIndex={activeMobileTab === "calendar" ? 0 : -1}
          type="button"
        >
          Calendar
        </button>
        <button
          aria-controls="agenda-mobile-pane"
          aria-selected={activeMobileTab === "agenda"}
          id="agenda-mobile-tab"
          onClick={() => activateMobileTab("agenda")}
          onKeyDown={(event) =>
            handleMobileTabKeyDown(event, "agenda")
          }
          ref={agendaTabRef}
          role="tab"
          tabIndex={activeMobileTab === "agenda" ? 0 : -1}
          type="button"
        >
          Agenda
        </button>
      </div>

      <div
        aria-labelledby="calendar-mobile-tab"
        className="calendar-page__pane calendar-page__pane--calendar"
        data-mobile-active={activeMobileTab === "calendar"}
        data-mobile-pane="calendar"
        id="calendar-mobile-pane"
        role="tabpanel"
      >
        {calendars.length > 0 ? (
          <fieldset className="calendar-filters">
            <legend>Calendars</legend>
            {calendars.map((calendar) => (
              <label key={calendar.calendarId}>
                <input
                  checked={visibleIds.has(calendar.calendarId)}
                  onChange={() => toggleCalendar(calendar.calendarId)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className="calendar-filters__color"
                  style={{
                    backgroundColor: calendar.colorHex ?? "#6C63E8",
                  }}
                />
                {calendar.name}
              </label>
            ))}
          </fieldset>
        ) : null}

        <PlannerCalendar
          key={calendarSurfaceRevision}
          view={view}
          events={events}
          loading={loading}
          onViewChange={setView}
          onDateClick={handleDateClick}
          onSelect={handleSelect}
          onEventClick={handleEventClick}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          onCreate={handleCreate}
          onDatesSet={handleDatesSet}
        />
      </div>

      <div
        aria-labelledby="agenda-mobile-tab"
        className="calendar-page__pane calendar-page__pane--agenda"
        data-mobile-active={activeMobileTab === "agenda"}
        data-mobile-pane="agenda"
        id="agenda-mobile-pane"
        role="tabpanel"
      >
        <SelectedDayAgenda
          selectedDate={selectedDate}
          events={agendaEvents}
          calendars={calendars}
          onEventClick={handleAgendaEventClick}
          onCreateEvent={handleCreate}
        />
      </div>

      {editorState ? (
        <EventDialog
          open
          api={api}
          userId={userId}
          calendars={calendars}
          onClose={() => setEditorState(null)}
          {...editorState}
        />
      ) : null}
    </section>
  );
}

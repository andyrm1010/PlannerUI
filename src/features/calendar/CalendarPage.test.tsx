import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlannerCalendar as PlannerCalendarModel,
  PlannerEvent,
} from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import { App } from "../../app/App";
import { renderWithProviders } from "../../test/renderWithProviders";
import {
  isEventInteractionPending,
  persistEventInteraction,
} from "../events/eventInteraction";
import { CalendarPage } from "./CalendarPage";

const fullCalendarMock = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
  dropRevert: vi.fn(),
  resizeRevert: vi.fn(),
  mountCount: 0,
  setRenderedEventIds: undefined as
    | ((eventIds: string[]) => void)
    | undefined,
  api: {
    prev: vi.fn(),
    today: vi.fn(),
    next: vi.fn(),
    changeView: vi.fn<(view: string) => void>(),
    view: {
      type: "dayGridMonth",
      title: "June 2026",
      currentStart: new Date(2026, 5, 1),
      currentEnd: new Date(2026, 6, 1),
    },
  },
}));

vi.mock("@fullcalendar/react", async () => {
  const React = await import("react");

  return {
    default: React.forwardRef(function MockFullCalendar(
      props: Record<string, unknown>,
      ref: React.ForwardedRef<{ getApi: () => typeof fullCalendarMock.api }>,
    ) {
      const [instanceId] = React.useState(
        () => ++fullCalendarMock.mountCount,
      );
      const eventIds = (
        props.events as Array<{ id?: string }> | undefined
      )?.flatMap((event) => (event.id ? [event.id] : [])) ?? [];
      const [renderedEventIds, setRenderedEventIds] =
        React.useState(eventIds);
      fullCalendarMock.props = props;
      fullCalendarMock.setRenderedEventIds = setRenderedEventIds;
      React.useImperativeHandle(ref, () => ({
        getApi: () => fullCalendarMock.api,
      }));

      React.useEffect(() => {
        setRenderedEventIds(eventIds);
      }, [props.events]);

      React.useEffect(() => {
        const datesSet = props.datesSet as
          | ((arg: Record<string, unknown>) => void)
          | undefined;
        datesSet?.({
          start: new Date("2026-06-01T00:00:00.000Z"),
          end: new Date("2026-07-01T00:00:00.000Z"),
          startStr: "2026-06-01T00:00:00.000Z",
          endStr: "2026-07-01T00:00:00.000Z",
          timeZone: "local",
          view: fullCalendarMock.api.view,
        });
      }, []);

      return (
        <div
          data-calendar-instance={instanceId}
          data-rendered-event-ids={renderedEventIds.join(",")}
          data-testid="full-calendar"
        >
          <button
            onClick={() => {
              const dateClick = props.dateClick as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              dateClick?.({
                date: new Date(2026, 5, 30),
                dateStr: "2026-06-30",
                allDay: true,
                dayEl: document.createElement("div"),
                jsEvent: new MouseEvent("click"),
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Choose June 30
          </button>
          <button
            onClick={() => {
              const dateClick = props.dateClick as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              dateClick?.({
                date: new Date(2026, 5, 12),
                dateStr: "2026-06-12",
                allDay: true,
                dayEl: document.createElement("div"),
                jsEvent: new MouseEvent("click"),
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Choose June 12
          </button>
          <button
            onClick={() => {
              const select = props.select as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              select?.({
                start: new Date("2026-06-18T13:00:00.000Z"),
                end: new Date("2026-06-18T14:30:00.000Z"),
                startStr: "2026-06-18T09:00:00-04:00",
                endStr: "2026-06-18T10:30:00-04:00",
                allDay: false,
                jsEvent: new MouseEvent("mouseup"),
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Select June 18 range
          </button>
          <button
            onClick={() => {
              const select = props.select as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              select?.({
                start: new Date("2026-06-20T00:00:00.000Z"),
                end: new Date("2026-06-22T00:00:00.000Z"),
                startStr: "2026-06-20",
                endStr: "2026-06-22",
                allDay: true,
                jsEvent: new MouseEvent("mouseup"),
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Select all-day range
          </button>
          <button
            onClick={() => {
              const datesSet = props.datesSet as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              fullCalendarMock.api.view.title = "July 2026";
              fullCalendarMock.api.view.currentStart = new Date(2026, 6, 1);
              fullCalendarMock.api.view.currentEnd = new Date(2026, 7, 1);
              datesSet?.({
                start: new Date(2026, 5, 28),
                end: new Date(2026, 7, 9),
                startStr: "2026-06-28T00:00:00-04:00",
                endStr: "2026-08-09T00:00:00-04:00",
                timeZone: "local",
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Navigate to July
          </button>
          <button
            onClick={() => {
              const eventClick = props.eventClick as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              const mappedEvent = (
                props.events as
                  | Array<{
                      extendedProps?: Record<string, unknown>;
                    }>
                  | undefined
              )?.[0];

              eventClick?.({
                event: {
                  extendedProps: mappedEvent?.extendedProps ?? {},
                },
                el: document.createElement("a"),
                jsEvent: new MouseEvent("click"),
                view: fullCalendarMock.api.view,
              });
            }}
            type="button"
          >
            Open mapped event
          </button>
          <button
            onClick={() => {
              const eventDrop = props.eventDrop as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              const mappedEvent = (
                props.events as
                  | Array<{
                      id?: string;
                      extendedProps?: Record<string, unknown>;
                    }>
                  | undefined
              )?.[0];

              eventDrop?.({
                event: {
                  id: mappedEvent?.id,
                  start: new Date("2026-06-13T16:00:00.000Z"),
                  end: new Date("2026-06-13T17:00:00.000Z"),
                  allDay: false,
                  extendedProps: mappedEvent?.extendedProps ?? {},
                },
                revert: fullCalendarMock.dropRevert,
              });
            }}
            type="button"
          >
            Drop mapped event
          </button>
          <button
            onClick={() => {
              const eventResize = props.eventResize as
                | ((arg: Record<string, unknown>) => void)
                | undefined;
              const mappedEvent = (
                props.events as
                  | Array<{
                      id?: string;
                      extendedProps?: Record<string, unknown>;
                    }>
                  | undefined
              )?.[0];

              eventResize?.({
                event: {
                  id: mappedEvent?.id,
                  start: new Date("2026-06-12T14:00:00.000Z"),
                  end: new Date("2026-06-12T16:30:00.000Z"),
                  allDay: false,
                  extendedProps: mappedEvent?.extendedProps ?? {},
                },
                revert: fullCalendarMock.resizeRevert,
              });
            }}
            type="button"
          >
            Resize mapped event
          </button>
        </div>
      );
    }),
  };
});

const calendar: PlannerCalendarModel = {
  calendarId: "calendar-1",
  ownerUserId: "user-1",
  name: "Work",
  description: null,
  colorHex: "#3366ff",
};

const event: PlannerEvent = {
  eventId: "event-1",
  calendarId: "calendar-1",
  createdByUserId: "user-1",
  title: "Project review",
  description: null,
  startUtc: "2026-06-12T14:00:00.000Z",
  endUtc: "2026-06-12T15:00:00.000Z",
  isAllDay: false,
};

const personalCalendar: PlannerCalendarModel = {
  ...calendar,
  calendarId: "calendar-2",
  name: "Personal",
  colorHex: "#ff6633",
};

const personalEvent: PlannerEvent = {
  ...event,
  eventId: "event-2",
  calendarId: "calendar-2",
  title: "Dinner",
  startUtc: "2026-06-12T22:00:00.000Z",
  endUtc: "2026-06-12T23:00:00.000Z",
};

const orphanedEvent: PlannerEvent = {
  ...event,
  eventId: "event-orphaned",
  calendarId: "missing-calendar",
};

function createApi({
  calendars = [calendar],
  events = [event, orphanedEvent],
}: {
  calendars?: PlannerCalendarModel[];
  events?: PlannerEvent[];
} = {}) {
  return {
    getCalendars: vi.fn().mockResolvedValue(calendars),
    getEvents: vi.fn().mockResolvedValue(events),
    createEvent: vi.fn().mockResolvedValue(event),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlannerApi;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.localStorage.clear();
  fullCalendarMock.props = undefined;
  fullCalendarMock.mountCount = 0;
  fullCalendarMock.setRenderedEventIds = undefined;
  fullCalendarMock.api.view.type = "dayGridMonth";
  fullCalendarMock.api.view.title = "June 2026";
  fullCalendarMock.api.view.currentStart = new Date(2026, 5, 1);
  fullCalendarMock.api.view.currentEnd = new Date(2026, 6, 1);
  fullCalendarMock.api.changeView.mockImplementation((nextView) => {
    fullCalendarMock.api.view.type = nextView;
    fullCalendarMock.api.view.currentStart = new Date(2026, 5, 8);
    fullCalendarMock.api.view.currentEnd = new Date(2026, 5, 15);
    const datesSet = fullCalendarMock.props?.datesSet as
      | ((arg: Record<string, unknown>) => void)
      | undefined;
    datesSet?.({
      start: new Date("2026-06-08T00:00:00.000Z"),
      end: new Date("2026-06-15T00:00:00.000Z"),
      startStr: "2026-06-08T00:00:00.000Z",
      endStr: "2026-06-15T00:00:00.000Z",
      timeZone: "local",
      view: fullCalendarMock.api.view,
    });
  });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CalendarPage", () => {
  it("queries the visible range and maps only events with calendars", async () => {
    const api = createApi();

    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    expect(fullCalendarMock.props?.initialView).toBe("dayGridMonth");
    await waitFor(() =>
      expect(api.getEvents).toHaveBeenCalledWith(
        "user-1",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      ),
    );
    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({
          id: "event-1",
          title: "Project review",
        }),
      ]),
    );
  });

  it("updates the selected-day heading after a date click", () => {
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose June 12" }));

    expect(
      screen.getByRole("complementary", {
        name: "Selected day agenda",
      }),
    ).toHaveTextContent(/Friday, June 12, 2026/);
  });

  it("moves a padded-range date to the new view current start", () => {
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose June 30" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Navigate to July" }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "Selected day agenda",
      }),
    ).toHaveTextContent(/Wednesday, July 1, 2026/);
  });

  it("preserves a selected date that remains within the new range", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose June 12" }));
    await user.click(screen.getByRole("button", { name: "Week" }));

    expect(
      screen.getByRole("complementary", {
        name: "Selected day agenda",
      }),
    ).toHaveTextContent(/Friday, June 12, 2026/);
  });

  it("filters the calendar and agenda from persisted checkboxes", async () => {
    const user = userEvent.setup();
    const api = createApi({
      calendars: [calendar, personalCalendar],
      events: [event, personalEvent],
    });

    renderWithProviders(<CalendarPage api={api} userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose June 12" }));

    const workCheckbox = await screen.findByRole("checkbox", {
      name: "Work",
    });
    const personalCheckbox = screen.getByRole("checkbox", {
      name: "Personal",
    });
    expect(workCheckbox).toBeChecked();
    expect(personalCheckbox).toBeChecked();
    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
        expect.objectContaining({ id: "event-2" }),
      ]),
    );
    expect(
      screen.getByRole("button", { name: /Project review.*Work/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Dinner.*Personal/ }),
    ).toBeVisible();

    await user.click(workCheckbox);

    expect(workCheckbox).not.toBeChecked();
    expect(window.localStorage.getItem("planner.calendar.hiddenIds")).toBe(
      JSON.stringify(["calendar-1"]),
    );
    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-2" }),
      ]),
    );
    expect(
      screen.queryByRole("button", { name: /Project review.*Work/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Dinner.*Personal/ }),
    ).toBeVisible();
  });

  it("tracks mobile Calendar and Agenda tab state without hiding panes", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );
    const calendarTab = screen.getByRole("tab", { name: "Calendar" });
    const agendaTab = screen.getByRole("tab", { name: "Agenda" });
    const calendarPane = view.container.querySelector(
      '[data-mobile-pane="calendar"]',
    );
    const agendaPane = view.container.querySelector(
      '[data-mobile-pane="agenda"]',
    );

    expect(calendarTab).toHaveAttribute("aria-selected", "true");
    expect(agendaTab).toHaveAttribute("aria-selected", "false");
    expect(calendarPane).toHaveAttribute("data-mobile-active", "true");
    expect(agendaPane).toHaveAttribute("data-mobile-active", "false");
    expect(calendarPane).not.toHaveAttribute("hidden");
    expect(agendaPane).not.toHaveAttribute("hidden");

    await user.click(agendaTab);

    expect(calendarTab).toHaveAttribute("aria-selected", "false");
    expect(agendaTab).toHaveAttribute("aria-selected", "true");
    expect(calendarPane).toHaveAttribute("data-mobile-active", "false");
    expect(agendaPane).toHaveAttribute("data-mobile-active", "true");
  });

  it("supports roving keyboard focus across the mobile tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );
    const calendarTab = screen.getByRole("tab", { name: "Calendar" });
    const agendaTab = screen.getByRole("tab", { name: "Agenda" });

    expect(calendarTab).toHaveAttribute("tabindex", "0");
    expect(agendaTab).toHaveAttribute("tabindex", "-1");

    await user.click(calendarTab);
    await user.keyboard("{ArrowRight}");

    expect(agendaTab).toHaveFocus();
    expect(agendaTab).toHaveAttribute("aria-selected", "true");
    expect(agendaTab).toHaveAttribute("tabindex", "0");
    expect(calendarTab).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}");
    expect(calendarTab).toHaveFocus();
    expect(calendarTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(agendaTab).toHaveFocus();
    expect(agendaTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(calendarTab).toHaveFocus();
    expect(calendarTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(agendaTab).toHaveFocus();
    expect(agendaTab).toHaveAttribute("aria-selected", "true");
  });

  it("opens events and create dialogs from the selected-day agenda", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose June 12" }));

    await user.click(
      await screen.findByRole("button", {
        name: /Project review.*Work/,
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Project review",
    );
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(
      screen.getByRole("checkbox", {
        name: "Work",
      }),
    );
    await user.click(
      within(
        screen.getByRole("complementary", {
          name: "Selected day agenda",
        }),
      ).getByRole("button", {
        name: "Create event",
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "Create event" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Start time")).toHaveValue(
      "2026-06-12T09:00",
    );
    expect(screen.getByLabelText("End time")).toHaveValue(
      "2026-06-12T10:00",
    );
  });

  it("opens the selected range in the create dialog", () => {
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select June 18 range" }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "Selected day agenda",
      }),
    ).toHaveTextContent(/Thursday, June 18, 2026/);
    expect(
      screen.getByRole("dialog", { name: "Create event" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Start time")).toHaveValue(
      "2026-06-18T09:00",
    );
    expect(screen.getByLabelText("End time")).toHaveValue(
      "2026-06-18T10:30",
    );
  });

  it("opens an all-day selection with an inclusive end date", () => {
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select all-day range" }),
    );

    expect(screen.getByRole("checkbox", { name: "All day" })).toBeChecked();
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-06-20");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-06-21");
  });

  it.each([
    {
      kind: "timed",
      event: {
        ...event,
        eventId: "timed-event",
        title: "Late local event",
        startUtc: new Date(2026, 5, 18, 23, 30).toISOString(),
        endUtc: new Date(2026, 5, 18, 23, 45).toISOString(),
        isAllDay: false,
      },
      expectedDate: /Thursday, June 18, 2026/,
    },
    {
      kind: "all-day",
      event: {
        ...event,
        eventId: "all-day-event",
        title: "All-day event",
        startUtc: "2026-06-20T00:00:00.000Z",
        endUtc: "2026-06-21T00:00:00.000Z",
        isAllDay: true,
      },
      expectedDate: /Saturday, June 20, 2026/,
    },
  ])(
    "syncs the selected-day agenda before opening a $kind event",
    async ({ event: clickedEvent, expectedDate }) => {
    renderWithProviders(
      <CalendarPage
        api={createApi({ events: [clickedEvent] })}
        userId="user-1"
      />,
    );

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: clickedEvent.eventId }),
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choose June 12" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open mapped event" }),
    );

    const agenda = screen.getByRole("complementary", {
      name: "Selected day agenda",
    });
    expect(agenda).toHaveTextContent(expectedDate);
    expect(
      within(agenda).getByRole("button", {
        name: new RegExp(clickedEvent.title),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      clickedEvent.title,
    );
    },
  );

  it("persists drop and resize interactions and refetches exactly once after each", async () => {
    const api = createApi();
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    const initialFetchCount = vi.mocked(api.getEvents).mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );

    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledTimes(1));
    expect(api.updateEvent).toHaveBeenNthCalledWith(1, "event-1", {
      calendarId: "calendar-1",
      title: "Project review",
      description: null,
      startUtc: "2026-06-13T16:00:00.000Z",
      endUtc: "2026-06-13T17:00:00.000Z",
      isAllDay: false,
    });
    await waitFor(() =>
      expect(vi.mocked(api.getEvents)).toHaveBeenCalledTimes(
        initialFetchCount + 1,
      ),
    );
    expect(fullCalendarMock.mountCount).toBe(2);
    const afterDropFetchCount = vi.mocked(api.getEvents).mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "Resize mapped event" }),
    );

    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledTimes(2));
    expect(api.updateEvent).toHaveBeenNthCalledWith(2, "event-1", {
      calendarId: "calendar-1",
      title: "Project review",
      description: null,
      startUtc: "2026-06-12T14:00:00.000Z",
      endUtc: "2026-06-12T16:30:00.000Z",
      isAllDay: false,
    });
    await waitFor(() =>
      expect(vi.mocked(api.getEvents)).toHaveBeenCalledTimes(
        afterDropFetchCount + 1,
      ),
    );
    expect(fullCalendarMock.mountCount).toBe(3);
    expect(fullCalendarMock.dropRevert).not.toHaveBeenCalled();
    expect(fullCalendarMock.resizeRevert).not.toHaveBeenCalled();
  });

  it("reverts a failed interaction, shows an API notice, and refetches events", async () => {
    const api = createApi();
    vi.mocked(api.updateEvent).mockRejectedValue(
      new ApiError(
        409,
        "Unable to update event.",
        "That time is no longer available.",
      ),
    );
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    const initialFetchCount = vi.mocked(api.getEvents).mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "That time is no longer available.",
    );
    expect(alert).toHaveAttribute("data-tone", "error");
    expect(fullCalendarMock.dropRevert).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(vi.mocked(api.getEvents)).toHaveBeenCalledTimes(
        initialFetchCount + 1,
      ),
    );
    expect(fullCalendarMock.mountCount).toBe(2);
  });

  it("rejects a busy same-event interaction without a notice or extra refetch", async () => {
    const pendingUpdate = deferred<void>();
    const api = createApi();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    const initialFetchCount = vi.mocked(api.getEvents).mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());

    fireEvent.click(
      screen.getByRole("button", { name: "Resize mapped event" }),
    );

    expect(fullCalendarMock.resizeRevert).toHaveBeenCalledOnce();
    expect(fullCalendarMock.dropRevert).not.toHaveBeenCalled();
    expect(api.updateEvent).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getEvents).toHaveBeenCalledTimes(initialFetchCount);

    pendingUpdate.resolve();
    await waitFor(() =>
      expect(api.getEvents).toHaveBeenCalledTimes(initialFetchCount + 1),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fullCalendarMock.mountCount).toBe(2);
  });

  it("keeps editors blocked until slow reconciliation and remount finish", async () => {
    const reconciliation = deferred<PlannerEvent[]>();
    const api = createApi();
    vi.mocked(api.getEvents)
      .mockResolvedValueOnce([event, orphanedEvent])
      .mockReturnValueOnce(reconciliation.promise);
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Choose June 12" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());
    await waitFor(() => expect(api.getEvents).toHaveBeenCalledTimes(2));

    fireEvent.click(
      screen.getByRole("button", { name: "Open mapped event" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Project review.*Work/,
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Edit event" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fullCalendarMock.mountCount).toBe(1);

    reconciliation.resolve([event, orphanedEvent]);
    await waitFor(() =>
      expect(fullCalendarMock.mountCount).toBe(2),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open mapped event" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeVisible();
  });

  it("remounts from filtered props after failure revert resurrects a hidden event", async () => {
    const pendingUpdate = deferred<void>();
    const api = createApi();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    fullCalendarMock.dropRevert.mockImplementation(() => {
      fullCalendarMock.setRenderedEventIds?.(["event-1"]);
    });
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Work" }),
    );
    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([]),
    );

    pendingUpdate.reject(new Error("Update failed."));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Update failed.",
    );
    await waitFor(() => expect(fullCalendarMock.mountCount).toBe(2));
    expect(screen.getByTestId("full-calendar")).toHaveAttribute(
      "data-rendered-event-ids",
      "",
    );
  });

  it("remounts and reports an error when reconciliation rejects", async () => {
    const reconciliationError = new Error("Reconciliation failed.");
    vi.spyOn(
      QueryClient.prototype,
      "invalidateQueries",
    ).mockRejectedValueOnce(reconciliationError);
    const api = createApi();
    renderWithProviders(<CalendarPage api={api} userId="user-1" />);

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reconciliation failed.",
    );
    await waitFor(() => expect(fullCalendarMock.mountCount).toBe(2));
  });

  it("releases the event lock when unmounted before reconciliation", async () => {
    const pendingUpdate = deferred<void>();
    const api = createApi();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    const page = renderWithProviders(
      <CalendarPage api={api} userId="user-1" />,
    );

    await waitFor(() =>
      expect(fullCalendarMock.props?.events).toEqual([
        expect.objectContaining({ id: "event-1" }),
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Drop mapped event" }),
    );
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());
    expect(isEventInteractionPending("event-1")).toBe(true);

    page.unmount();
    pendingUpdate.reject(new Error("Update failed after unmount."));

    await waitFor(() =>
      expect(isEventInteractionPending("event-1")).toBe(false),
    );
    expect(fullCalendarMock.dropRevert).toHaveBeenCalledOnce();
    await expect(
      persistEventInteraction({
        event: {
          start: new Date("2026-06-14T16:00:00.000Z"),
          end: new Date("2026-06-14T17:00:00.000Z"),
          allDay: false,
          extendedProps: { plannerEvent: event },
        },
        revert: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        reconcile: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBeUndefined();
  });

  it("date click only selects the date while toolbar create uses a one-hour default", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose June 12" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      within(
        screen.getByRole("region", { name: "Planner calendar" }),
      ).getByRole("button", { name: "Create event" }),
    );
    expect(screen.getByLabelText("Start time")).toHaveValue(
      "2026-06-12T09:00",
    );
    expect(screen.getByLabelText("End time")).toHaveValue(
      "2026-06-12T10:00",
    );
  });

  it("changes to Week view and persists the choice", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderWithProviders(
      <CalendarPage api={createApi()} userId="user-1" />,
    );

    await user.click(screen.getByRole("button", { name: "Week" }));

    expect(fullCalendarMock.api.changeView).toHaveBeenCalledWith(
      "timeGridWeek",
    );
    expect(window.localStorage.getItem("planner.calendar.view")).toBe(
      "timeGridWeek",
    );
    expect(setItemSpy).toHaveBeenCalledOnce();
    expect(setItemSpy).toHaveBeenCalledWith(
      "planner.calendar.view",
      "timeGridWeek",
    );
    expect(
      screen.getByRole("button", { name: "Week" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("App calendar route", () => {
  it("uses the configured API and demo user for calendar queries", async () => {
    const demoUserId = "0f4a0034-9e1c-4b66-a4f4-8890c3d32f86";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const pageSize = url.includes("/api/Calendars") ? 200 : 500;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            totalCount: 0,
            page: 1,
            pageSize,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <App
        config={{
          apiBaseUrl: "https://api.example.test",
          demoUserId,
        }}
      />,
      { route: "/calendar" },
    );

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([url]) =>
        String(url),
      );
      expect(requestedUrls).toContain(
        `https://api.example.test/api/Calendars?ownerUserId=${demoUserId}&page=1&pageSize=200`,
      );
      expect(requestedUrls).toContain(
        `https://api.example.test/api/Events?ownerUserId=${demoUserId}&startUtc=2026-06-01T00%3A00%3A00.000Z&endUtc=2026-07-01T00%3A00%3A00.000Z&page=1&pageSize=500`,
      );
    });
  });
});

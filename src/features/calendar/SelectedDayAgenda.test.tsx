import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PlannerCalendar,
  PlannerEvent,
} from "../../api/contracts";
import { SelectedDayAgenda } from "./SelectedDayAgenda";

const calendars: PlannerCalendar[] = [
  {
    calendarId: "work",
    ownerUserId: "user-1",
    name: "Work",
    description: null,
    colorHex: "#3366ff",
  },
];

const allDayEvent: PlannerEvent = {
  eventId: "all-day",
  calendarId: "work",
  createdByUserId: "user-1",
  title: "Company holiday",
  description: null,
  startUtc: "2026-06-12T00:00:00.000Z",
  endUtc: "2026-06-13T00:00:00.000Z",
  isAllDay: true,
};

const timedEvent: PlannerEvent = {
  eventId: "timed",
  calendarId: "work",
  createdByUserId: "user-1",
  title: "Project review",
  description: null,
  startUtc: "2026-06-12T14:00:00.000Z",
  endUtc: "2026-06-12T15:30:00.000Z",
  isAllDay: false,
};

const previousDayEvent: PlannerEvent = {
  ...timedEvent,
  eventId: "previous-day",
  title: "Late deployment",
  startUtc: new Date(2026, 5, 11, 23).toISOString(),
  endUtc: new Date(2026, 5, 12, 1).toISOString(),
};

const nextDayEvent: PlannerEvent = {
  ...timedEvent,
  eventId: "next-day",
  title: "Overnight maintenance",
  startUtc: new Date(2026, 5, 12, 23).toISOString(),
  endUtc: new Date(2026, 5, 13, 1).toISOString(),
};

afterEach(cleanup);

describe("SelectedDayAgenda", () => {
  it("renders the selected date and event details", () => {
    const expectedTimeRange = `${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timedEvent.startUtc))} - ${new Intl.DateTimeFormat(
      undefined,
      {
        hour: "numeric",
        minute: "2-digit",
      },
    ).format(new Date(timedEvent.endUtc))}`;

    render(
      <SelectedDayAgenda
        selectedDate="2026-06-12"
        events={[allDayEvent, timedEvent]}
        calendars={calendars}
        onEventClick={vi.fn()}
        onCreateEvent={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /Friday, June 12, 2026/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /Company holiday.*All day.*Work/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: new RegExp(
          `Project review.*${expectedTimeRange.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}.*Work`,
        ),
      }),
    ).toBeVisible();
    expect(screen.getAllByText("Work")).toHaveLength(2);
    expect(screen.getByTestId("agenda-color-all-day")).toHaveStyle({
      backgroundColor: "#3366ff",
    });
  });

  it("opens an event from its clickable row", async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();

    render(
      <SelectedDayAgenda
        selectedDate="2026-06-12"
        events={[timedEvent]}
        calendars={calendars}
        onEventClick={onEventClick}
        onCreateEvent={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Project review.*Work/ }),
    );

    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(timedEvent);
  });

  it("labels an event that began on the previous local day", () => {
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
    });
    const expectedLabel = `Continues from ${weekdayFormatter.format(
      new Date(previousDayEvent.startUtc),
    )}, ${timeFormatter.format(
      new Date(previousDayEvent.startUtc),
    )} - ${timeFormatter.format(new Date(previousDayEvent.endUtc))}`;

    render(
      <SelectedDayAgenda
        selectedDate="2026-06-12"
        events={[previousDayEvent]}
        calendars={calendars}
        onEventClick={vi.fn()}
        onCreateEvent={vi.fn()}
      />,
    );

    expect(screen.getByText(expectedLabel)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`Late deployment.*${expectedLabel}`),
      }),
    ).toBeVisible();
  });

  it("labels an event that continues into the next local day", () => {
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
    });
    const expectedLabel = `${timeFormatter.format(
      new Date(nextDayEvent.startUtc),
    )} - Continues ${weekdayFormatter.format(
      new Date(nextDayEvent.endUtc),
    )}, ${timeFormatter.format(new Date(nextDayEvent.endUtc))}`;

    render(
      <SelectedDayAgenda
        selectedDate="2026-06-12"
        events={[nextDayEvent]}
        calendars={calendars}
        onEventClick={vi.fn()}
        onCreateEvent={vi.fn()}
      />,
    );

    expect(screen.getByText(expectedLabel)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`Overnight maintenance.*${expectedLabel}`),
      }),
    ).toBeVisible();
  });

  it("renders an empty state with a create event action", async () => {
    const user = userEvent.setup();
    const onCreateEvent = vi.fn();

    render(
      <SelectedDayAgenda
        selectedDate="2026-06-12"
        events={[]}
        calendars={calendars}
        onEventClick={vi.fn()}
        onCreateEvent={onCreateEvent}
      />,
    );

    expect(screen.getByText("No events for this day.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Create event" }),
    );
    expect(onCreateEvent).toHaveBeenCalledOnce();
  });
});

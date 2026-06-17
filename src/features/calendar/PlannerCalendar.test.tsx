import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerCalendar } from "./PlannerCalendar";

const fullCalendarMock = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
  api: {
    prev: vi.fn(),
    today: vi.fn(),
    next: vi.fn(),
    changeView: vi.fn(),
    view: {
      type: "dayGridMonth",
      title: "June 2026",
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
      fullCalendarMock.props = props;
      React.useImperativeHandle(ref, () => ({
        getApi: () => fullCalendarMock.api,
      }));

      React.useEffect(() => {
        const datesSet = props.datesSet as
          | ((arg: {
              start: Date;
              end: Date;
              startStr: string;
              endStr: string;
              timeZone: string;
              view: typeof fullCalendarMock.api.view;
            }) => void)
          | undefined;
        datesSet?.({
          start: new Date("2026-06-01T00:00:00.000Z"),
          end: new Date("2026-07-01T00:00:00.000Z"),
          startStr: "2026-06-01T00:00:00.000Z",
          endStr: "2026-07-01T00:00:00.000Z",
          timeZone: "local",
          view: fullCalendarMock.api.view,
        });
      }, [props.datesSet]);

      return <div data-testid="full-calendar" />;
    }),
  };
});

afterEach(cleanup);

beforeEach(() => {
  fullCalendarMock.props = undefined;
  fullCalendarMock.api.view.type = "dayGridMonth";
  fullCalendarMock.api.view.title = "June 2026";
  vi.clearAllMocks();
  fullCalendarMock.api.changeView.mockImplementation((nextView: string) => {
    fullCalendarMock.api.view.type = nextView;
    const datesSet = fullCalendarMock.props?.datesSet as
      | ((arg: {
          start: Date;
          end: Date;
          startStr: string;
          endStr: string;
          timeZone: string;
          view: typeof fullCalendarMock.api.view;
        }) => void)
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
});

function renderCalendar(
  overrides: Partial<React.ComponentProps<typeof PlannerCalendar>> = {},
) {
  const props: React.ComponentProps<typeof PlannerCalendar> = {
    view: "dayGridMonth",
    events: [],
    loading: false,
    onViewChange: vi.fn(),
    onDateClick: vi.fn(),
    onSelect: vi.fn(),
    onEventClick: vi.fn(),
    onEventDrop: vi.fn(),
    onEventResize: vi.fn(),
    onCreate: vi.fn(),
    onDatesSet: vi.fn(),
    ...overrides,
  };

  return { ...render(<PlannerCalendar {...props} />), props };
}

describe("PlannerCalendar", () => {
  it("drives the FullCalendar API from an accessible custom toolbar", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    const onCreate = vi.fn();

    renderCalendar({ onViewChange, onCreate });

    expect(screen.getByText("June 2026")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Month" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Create event" }),
    ).toHaveClass("button--primary");

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Week" }));
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(fullCalendarMock.api.prev).toHaveBeenCalledOnce();
    expect(fullCalendarMock.api.today).toHaveBeenCalledOnce();
    expect(fullCalendarMock.api.next).toHaveBeenCalledOnce();
    expect(fullCalendarMock.api.changeView).toHaveBeenCalledWith(
      "timeGridWeek",
    );
    expect(onViewChange).toHaveBeenCalledOnce();
    expect(onViewChange).toHaveBeenCalledWith("timeGridWeek");
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("passes required calendar options and synchronizes an external view", () => {
    const onDatesSet = vi.fn();
    const view = renderCalendar({ onDatesSet });

    expect(fullCalendarMock.props).toMatchObject({
      initialView: "dayGridMonth",
      headerToolbar: false,
      editable: true,
      selectable: true,
      selectMirror: true,
      nowIndicator: true,
      dayMaxEvents: true,
      slotDuration: "00:30:00",
      snapDuration: "00:30:00",
      height: "100%",
    });
    expect(onDatesSet).toHaveBeenCalledOnce();

    view.rerender(
      <PlannerCalendar {...view.props} view="timeGridDay" />,
    );

    expect(fullCalendarMock.api.changeView).toHaveBeenCalledWith(
      "timeGridDay",
    );
  });

  it("announces loading calendar data", () => {
    renderCalendar({ loading: true });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading calendar data",
    );
  });
});

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar } from "../../api/contracts";
import {
  EventForm,
  type EventFormValues,
  type EventFormSubmission,
} from "./EventForm";

const calendars: PlannerCalendar[] = [
  {
    calendarId: "work",
    ownerUserId: "user-1",
    name: "Work",
    description: null,
    colorHex: "#3366ff",
  },
  {
    calendarId: "personal",
    ownerUserId: "user-1",
    name: "Personal",
    description: null,
    colorHex: "#ff6633",
  },
];

const timedValues: EventFormValues = {
  title: "Project review",
  description: "Discuss the launch.",
  calendarId: "work",
  isAllDay: false,
  startDate: "2026-06-12",
  endDate: "2026-06-12",
  startDateTime: "2026-06-12T09:00",
  endDateTime: "2026-06-12T10:00",
};

afterEach(cleanup);

describe("EventForm", () => {
  it("validates required fields and the title length", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EventForm
        mode="create"
        createdByUserId="user-1"
        initialValues={{ ...timedValues, title: " ", calendarId: "" }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Create event" }),
    ).toHaveClass("button--primary");
    await user.click(screen.getByRole("button", { name: "Create event" }));
    const titleError = screen.getByText("Title is required.");
    const calendarError = screen.getByText("Calendar is required.");
    const title = screen.getByRole("textbox", { name: "Title" });
    const calendar = screen.getByRole("combobox", { name: "Calendar" });
    expect(titleError).toBeVisible();
    expect(calendarError).toBeVisible();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", titleError.id);
    expect(calendar).toHaveAttribute("aria-invalid", "true");
    expect(calendar).toHaveAttribute("aria-describedby", calendarError.id);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Title" }),
      { target: { value: "x".repeat(301) } },
    );
    expect(screen.getByText("Title must be 300 characters or fewer.")).toBeVisible();
  });

  it("requires timed start to precede timed end", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EventForm
        mode="create"
        createdByUserId="user-1"
        initialValues={{
          ...timedValues,
          startDateTime: "2026-06-12T10:00",
          endDateTime: "2026-06-12T10:00",
        }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create event" }));
    const error = screen.getByText("End must be after start.");
    const start = screen.getByLabelText("Start time");
    const end = screen.getByLabelText("End time");
    expect(error).toBeVisible();
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(start).toHaveAttribute("aria-describedby", error.id);
    expect(end).toHaveAttribute("aria-describedby", error.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses inclusive all-day dates and hides timed controls", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EventForm
        mode="create"
        createdByUserId="user-1"
        initialValues={{
          ...timedValues,
          startDate: "2026-06-13",
          endDate: "2026-06-12",
        }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "All day" }));
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create event" }));
    const error = screen.getByText(
      "End date cannot be before start date.",
    );
    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");
    expect(error).toBeVisible();
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(start).toHaveAttribute("aria-describedby", error.id);
    expect(end).toHaveAttribute("aria-describedby", error.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("reports blank all-day dates instead of throwing during mapping", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EventForm
        mode="create"
        createdByUserId="user-1"
        initialValues={{
          ...timedValues,
          isAllDay: true,
          startDate: "",
          endDate: "",
        }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create event" }));
    expect(
      screen.getByText("Enter valid start and end dates."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("maps a timed create submission with a trimmed title and creator", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(value: EventFormSubmission) => void>();

    render(
      <EventForm
        mode="create"
        createdByUserId="user-1"
        initialValues={{ ...timedValues, title: "  Project review  " }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Calendar" }),
      "personal",
    );
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "create",
      input: {
        calendarId: "personal",
        createdByUserId: "user-1",
        title: "Project review",
        description: "Discuss the launch.",
        isAllDay: false,
        startUtc: new Date("2026-06-12T09:00").toISOString(),
        endUtc: new Date("2026-06-12T10:00").toISOString(),
      },
    });
  });

  it("preserves valid 15-minute timed events", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(value: EventFormSubmission) => void>();

    render(
      <EventForm
        mode="edit"
        initialValues={{
          ...timedValues,
          startDateTime: "2026-06-12T09:00",
          endDateTime: "2026-06-12T09:15",
        }}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "edit",
      input: {
        calendarId: "work",
        title: "Project review",
        description: "Discuss the launch.",
        isAllDay: false,
        startUtc: new Date("2026-06-12T09:00").toISOString(),
        endUtc: new Date("2026-06-12T09:15").toISOString(),
      },
    });
  });

  it("disables edit submission while pending", () => {
    render(
      <EventForm
        mode="edit"
        initialValues={timedValues}
        calendars={calendars}
        onSubmit={vi.fn()}
        pending
      />,
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("changes calendar and converts a timed edit to an all-day update", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(value: EventFormSubmission) => void>();

    render(
      <EventForm
        mode="edit"
        initialValues={timedValues}
        calendars={calendars}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Calendar" }),
      "personal",
    );
    await user.click(screen.getByRole("checkbox", { name: "All day" }));
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-06-20" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-06-22" },
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "edit",
      input: {
        calendarId: "personal",
        title: "Project review",
        description: "Discuss the launch.",
        isAllDay: true,
        startUtc: "2026-06-20T00:00:00.000Z",
        endUtc: "2026-06-23T00:00:00.000Z",
      },
    });
    expect(
      (onSubmit.mock.calls[0]?.[0] as { input: object }).input,
    ).not.toHaveProperty("createdByUserId");
  });

  it("retains edits on ordinary rerenders and resets values and errors for a new editor identity", async () => {
    const user = userEvent.setup();
    const view = render(
      <EventForm
        mode="edit"
        resetKey="event-1"
        initialValues={timedValues}
        calendars={calendars}
        onSubmit={vi.fn()}
      />,
    );
    const title = screen.getByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Title is required.")).toBeVisible();

    view.rerender(
      <EventForm
        mode="edit"
        resetKey="event-1"
        initialValues={{ ...timedValues, title: "Server refresh" }}
        calendars={calendars}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(screen.getByText("Title is required.")).toBeVisible();

    view.rerender(
      <EventForm
        mode="edit"
        resetKey="event-2"
        initialValues={{
          ...timedValues,
          title: "Second event",
          calendarId: "personal",
        }}
        calendars={calendars}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );
    expect(
      screen.queryByText("Title is required."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Calendar" })).toHaveValue(
      "personal",
    );
  });
});

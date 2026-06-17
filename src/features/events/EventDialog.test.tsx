import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar, PlannerEvent } from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { AppProviders } from "../../app/AppProviders";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EventDialog } from "./EventDialog";

const calendars: PlannerCalendar[] = [
  {
    calendarId: "work",
    ownerUserId: "user-1",
    name: "Work",
    description: null,
    colorHex: "#3366ff",
  },
];

const event: PlannerEvent = {
  eventId: "event-1",
  calendarId: "work",
  createdByUserId: "user-1",
  title: "Project review",
  description: "Discuss launch.",
  startUtc: new Date("2026-06-12T09:00").toISOString(),
  endUtc: new Date("2026-06-12T10:00").toISOString(),
  isAllDay: false,
};

function createApi() {
  return {
    createEvent: vi.fn().mockResolvedValue({ ...event, eventId: "created" }),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EventDialog", () => {
  it("prefills a timed selection and closes with a success notice after create", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="create"
        api={api}
        userId="user-1"
        calendars={calendars}
        selection={{
          startUtc: new Date("2026-06-18T09:00").toISOString(),
          endUtc: new Date("2026-06-18T10:30").toISOString(),
          allDay: false,
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByLabelText("Start time")).toHaveValue(
      "2026-06-18T09:00",
    );
    expect(screen.getByLabelText("End time")).toHaveValue(
      "2026-06-18T10:30",
    );
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Planning");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledOnce());
    expect(api.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Planning",
        createdByUserId: "user-1",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Event created.")).toBeVisible();
  });

  it("converts an edit event, retains values on failure, and reports the error", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateEvent).mockRejectedValue(
      new Error("Update failed."),
    );
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Project review");
    await user.clear(title);
    await user.type(title, "Retained title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());
    expect(api.updateEvent).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ title: "Retained title" }),
    );
    expect(title).toHaveValue("Retained title");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Update failed.")).toBeVisible();
  });

  it("converts an all-day selection from exclusive UTC end to inclusive form dates", () => {
    renderWithProviders(
      <EventDialog
        open
        mode="create"
        api={createApi()}
        userId="user-1"
        calendars={calendars}
        selection={{
          startUtc: "2026-06-12T00:00:00.000Z",
          endUtc: "2026-06-14T00:00:00.000Z",
          allDay: true,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "All day" })).toBeChecked();
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-06-12");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-06-13");
  });

  it("shows delete only for edit and confirms deletion before closing", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete event?" }),
    ).toBeVisible();
    expect(api.deleteEvent).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteEvent).toHaveBeenCalledWith("event-1"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Event deleted.")).toBeVisible();
  });

  it("cancels or reports a failed deletion without closing the editor", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.deleteEvent).mockRejectedValue(new Error("Delete failed."));
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteEvent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteEvent).toHaveBeenCalledOnce());
    expect(screen.getByText("Delete failed.")).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks every close and delete path during save, then closes exactly once", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingUpdate = deferred<void>();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const editor = screen.getByRole("dialog", { name: "Edit event" });
    await waitFor(() =>
      expect(
        within(editor).getByRole("button", { name: "Close" }),
      ).toBeDisabled(),
    );
    expect(
      within(editor).getByRole("button", { name: "Delete event" }),
    ).toBeDisabled();

    await user.click(within(editor).getByRole("button", { name: "Close" }));
    fireEvent(
      editor,
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("alertdialog", { name: "Delete event?" }),
    ).not.toBeInTheDocument();

    await act(async () => pendingUpdate.resolve());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("disables the form and both dialogs while delete is pending, then closes once", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingDelete = deferred<void>();
    vi.mocked(api.deleteEvent).mockReturnValue(pendingDelete.promise);
    const onClose = vi.fn();

    renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const editor = screen.getByRole("dialog", { name: "Edit event" });
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete event?",
    });

    await waitFor(() =>
      expect(
        within(editor).getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    expect(
      within(editor).getByRole("button", { name: "Close" }),
    ).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Close" }),
    ).toBeDisabled();

    await act(async () => pendingDelete.resolve());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("clears delete confirmation when the controlled outer dialog closes", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();
    const view = renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete event?" }),
    ).toBeVisible();

    view.rerender(
      <EventDialog
        open={false}
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    expect(
      screen.queryByRole("alertdialog", { name: "Delete event?" }),
    ).not.toBeInTheDocument();
  });

  it("does not carry event-1 delete confirmation or action into event 2", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();
    const secondEvent: PlannerEvent = {
      ...event,
      eventId: "event-2",
      title: "Second event",
    };
    const view = renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete event?" }),
    ).toBeVisible();

    view.rerender(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={secondEvent}
        onClose={onClose}
      />,
    );

    expect(
      screen.queryByRole("alertdialog", { name: "Delete event?" }),
    ).not.toBeInTheDocument();
    expect(api.deleteEvent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(api.deleteEvent).toHaveBeenCalledWith("event-2"),
    );
    expect(api.deleteEvent).toHaveBeenCalledOnce();
    expect(api.deleteEvent).not.toHaveBeenCalledWith("event-1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not let a stale save completion close a newly supplied event", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingUpdate = deferred<void>();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    const onClose = vi.fn();
    const secondEvent: PlannerEvent = {
      ...event,
      eventId: "event-2",
      title: "Second event",
    };
    const view = renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());

    view.rerender(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={secondEvent}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );

    await act(async () => pendingUpdate.resolve());
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );
  });

  it("invalidates event-1 before a promise resolved during the event-2 commit can close it", async () => {
    const api = createApi();
    const pendingUpdate = deferred<void>();
    vi.mocked(api.updateEvent).mockReturnValue(pendingUpdate.promise);
    const onClose = vi.fn();
    const secondEvent: PlannerEvent = {
      ...event,
      eventId: "event-2",
      title: "Second event",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveSecondCommit!: () => void;
    const secondCommit = new Promise<void>((resolve) => {
      resolveSecondCommit = resolve;
    });

    function CommitResolver({
      currentEvent,
    }: {
      currentEvent: PlannerEvent;
    }) {
      return (
        <>
          <span
            ref={(node) => {
              if (node && currentEvent.eventId === "event-2") {
                resolveSecondCommit();
                pendingUpdate.resolve();
              }
            }}
          />
          <EventDialog
            open
            mode="edit"
            api={api}
            userId="user-1"
            calendars={calendars}
            event={currentEvent}
            onClose={onClose}
          />
        </>
      );
    }

    flushSync(() => {
      root.render(
        <AppProviders>
          <CommitResolver currentEvent={event} />
        </AppProviders>,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());

    root.render(
      <AppProviders>
        <CommitResolver currentEvent={secondEvent} />
      </AppProviders>,
    );
    await secondCommit;
    await Promise.resolve();
    await Promise.resolve();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );

    flushSync(() => root.unmount());
    container.remove();
  });

  it("focuses the new event title when switching editors while open", () => {
    const api = createApi();
    const secondEvent: PlannerEvent = {
      ...event,
      eventId: "event-2",
      title: "Second event",
    };
    const view = renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole("button", {
      name: "Delete event",
    });
    deleteButton.focus();
    expect(deleteButton).toHaveFocus();

    view.rerender(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={secondEvent}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );
  });

  it("preserves same-event edits across refreshes and resets on reopen", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();
    const refreshedEvent = {
      ...event,
      title: "Server-refreshed title",
    };
    const view = renderWithProviders(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={event}
        onClose={onClose}
      />,
    );
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Unsaved title");

    view.rerender(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={refreshedEvent}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Unsaved title",
    );

    view.rerender(
      <EventDialog
        open={false}
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={refreshedEvent}
        onClose={onClose}
      />,
    );
    view.rerender(
      <EventDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendars={calendars}
        event={refreshedEvent}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Server-refreshed title",
    );
  });
});

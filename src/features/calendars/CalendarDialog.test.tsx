import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar } from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import { NoticeProvider } from "../../shared/notices/NoticeProvider";
import {
  CalendarDialog,
  validateCalendarColor,
} from "./CalendarDialog";

const unhandledRejectionListeners = new Set<
  (event: PromiseRejectionEvent) => void
>();

const calendar: PlannerCalendar = {
  calendarId: "calendar-1",
  ownerUserId: "user-1",
  name: "Work",
  description: "Team schedule",
  colorHex: "#3366FF",
};

function createApi() {
  return {
    createCalendar: vi.fn().mockResolvedValue({
      ...calendar,
      calendarId: "calendar-created",
    }),
    updateCalendar: vi.fn().mockResolvedValue(undefined),
    deleteCalendar: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlannerApi;
}

function renderDialog(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const renderWithProviders = (children: ReactElement | null) => (
    <QueryClientProvider client={client}>
      <NoticeProvider>{children}</NoticeProvider>
    </QueryClientProvider>
  );
  const view = render(renderWithProviders(ui));

  return {
    client,
    invalidate,
    removeDialog: () => view.rerender(renderWithProviders(null)),
    ...view,
  };
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

function trackUnhandledRejections() {
  const listener = vi.fn<(event: PromiseRejectionEvent) => void>();
  unhandledRejectionListeners.add(listener);
  window.addEventListener("unhandledrejection", listener);
  return listener;
}

afterEach(() => {
  unhandledRejectionListeners.forEach((listener) => {
    window.removeEventListener("unhandledrejection", listener);
  });
  unhandledRejectionListeners.clear();
  cleanup();
  vi.restoreAllMocks();
});

describe("CalendarDialog", () => {
  it("rejects a color that is not exactly six hex digits", () => {
    expect(validateCalendarColor("#12345")).toBe(
      "Color must be a six-digit hex value.",
    );
  });

  it("uses the new-calendar color and validates every field", async () => {
    const user = userEvent.setup();
    const api = createApi();

    renderDialog(
      <CalendarDialog
        open
        mode="create"
        api={api}
        userId="user-1"
        onClose={vi.fn()}
      />,
    );

    const color = screen.getByLabelText("Color");
    const colorValue = screen.getByText("Selected color: #6C63E8");
    expect(color).toHaveAttribute("type", "color");
    expect(colorValue).toBeVisible();
    expect(color).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(colorValue.id),
    );

    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );
    expect(screen.getByText("Name is required.")).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "x".repeat(201) },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description" }),
      { target: { value: "x".repeat(1001) } },
    );
    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );

    expect(
      screen.getByText("Name must be 200 characters or fewer."),
    ).toBeVisible();
    expect(
      screen.getByText("Description must be 1000 characters or fewer."),
    ).toBeVisible();
    expect(api.createCalendar).not.toHaveBeenCalled();
  });

  it("trims create values, includes the owner, invalidates calendars, and closes", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const onClose = vi.fn();
    const { invalidate } = renderDialog(
      <CalendarDialog
        open
        mode="create"
        api={api}
        userId="user-1"
        onClose={onClose}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "  Personal  ",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "   ",
    );
    fireEvent.change(screen.getByLabelText("Color"), {
      target: { value: "#abcdef" },
    });
    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );

    await waitFor(() => expect(api.createCalendar).toHaveBeenCalledOnce());
    expect(api.createCalendar).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      name: "Personal",
      description: null,
      colorHex: "#ABCDEF",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Calendar created.")).toBeVisible();
  });

  it("sends only editable fields and retains edits when an update fails", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateCalendar).mockRejectedValue(
      new ApiError(429, "Rate limited", undefined, 8),
    );
    const onClose = vi.fn();

    const { invalidate } = renderDialog(
      <CalendarDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendar={calendar}
        onClose={onClose}
      />,
    );

    const name = screen.getByRole("textbox", { name: "Name" });
    const description = screen.getByRole("textbox", {
      name: "Description",
    });
    await user.clear(name);
    await user.type(name, "  Updated work  ");
    await user.clear(description);
    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(api.updateCalendar).toHaveBeenCalledOnce());
    expect(api.updateCalendar).toHaveBeenCalledWith("calendar-1", {
      name: "Updated work",
      description: null,
      colorHex: "#3366FF",
    });
    expect(
      vi.mocked(api.updateCalendar).mock.calls[0]?.[1],
    ).not.toHaveProperty("ownerUserId");
    expect(name).toHaveValue("  Updated work  ");
    expect(description).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText("Too many requests. Try again in 8 seconds."),
    ).toBeVisible();

    vi.mocked(api.updateCalendar).mockResolvedValueOnce(undefined);
    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(api.updateCalendar).toHaveBeenCalledTimes(2),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Calendar updated.")).toBeVisible();
  });

  it("disables controls and prevents duplicate saves while pending", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pending = deferred<void>();
    vi.mocked(api.updateCalendar).mockReturnValue(pending.promise);
    const onClose = vi.fn();

    renderDialog(
      <CalendarDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendar={calendar}
        onClose={onClose}
      />,
    );

    const save = screen.getByRole("button", { name: "Save changes" });
    await user.dblClick(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(api.updateCalendar).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    pending.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("stays disabled while calendar invalidation reconciles", async () => {
    const api = createApi();
    const reconciliation = deferred<void>();
    const onClose = vi.fn();
    const { invalidate } = renderDialog(
      <CalendarDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendar={calendar}
        onClose={onClose}
      />,
    );
    invalidate.mockImplementation(() => reconciliation.promise);

    const save = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(save);

    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(api.updateCalendar).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    fireEvent.click(save);
    expect(api.updateCalendar).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      reconciliation.resolve();
      await reconciliation.promise;
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("binds a pending create to its initiating user", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pending = deferred<PlannerCalendar>();
    vi.mocked(api.createCalendar).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const firstDialog = (
      <CalendarDialog
        open
        mode="create"
        api={api}
        userId="user-1"
        onClose={onClose}
      />
    );
    const view = renderDialog(firstDialog);

    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "User one calendar",
    );
    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );
    await waitFor(() => expect(api.createCalendar).toHaveBeenCalledOnce());

    view.rerender(
      <QueryClientProvider client={view.client}>
        <NoticeProvider>
          <CalendarDialog
            open
            mode="create"
            api={api}
            userId="user-2"
            onClose={onClose}
          />
        </NoticeProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Name" }))
      .toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();

    await act(async () => {
      pending.resolve({
        ...calendar,
        calendarId: "calendar-created",
        name: "User one calendar",
      });
      await pending.promise;
    });

    expect(api.createCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "user-1" }),
    );
    expect(view.invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(view.invalidate).not.toHaveBeenCalledWith({
      queryKey: ["calendars", "user-2"],
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Calendar created.")).not.toBeInTheDocument();
  });

  it("binds a pending edit to its initiating user", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pending = deferred<void>();
    vi.mocked(api.updateCalendar).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const view = renderDialog(
      <CalendarDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendar={calendar}
        onClose={onClose}
      />,
    );

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "User one edit");
    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(api.updateCalendar).toHaveBeenCalledOnce());

    view.rerender(
      <QueryClientProvider client={view.client}>
        <NoticeProvider>
          <CalendarDialog
            open
            mode="edit"
            api={api}
            userId="user-2"
            calendar={calendar}
            onClose={onClose}
          />
        </NoticeProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Work",
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(view.invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(view.invalidate).not.toHaveBeenCalledWith({
      queryKey: ["calendars", "user-2"],
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Calendar updated.")).not.toBeInTheDocument();
  });

  it("ignores a successful create completion after unmount", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pending = deferred<PlannerCalendar>();
    vi.mocked(api.createCalendar).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unhandledRejection = trackUnhandledRejections();
    const view = renderDialog(
      <CalendarDialog
        open
        mode="create"
        api={api}
        userId="user-1"
        onClose={onClose}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Personal",
    );
    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );
    await waitFor(() => expect(api.createCalendar).toHaveBeenCalledOnce());

    view.removeDialog();
    await act(async () => {
      pending.resolve({
        ...calendar,
        calendarId: "calendar-created",
        name: "Personal",
      });
      await pending.promise;
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Calendar created.")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
  });

  it("ignores a failed edit completion after unmount", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pending = deferred<void>();
    vi.mocked(api.updateCalendar).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unhandledRejection = trackUnhandledRejections();
    const view = renderDialog(
      <CalendarDialog
        open
        mode="edit"
        api={api}
        userId="user-1"
        calendar={calendar}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(api.updateCalendar).toHaveBeenCalledOnce());

    view.removeDialog();
    await act(async () => {
      pending.reject(new Error("Update failed."));
      await pending.promise.catch(() => undefined);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Update failed.")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
  });
});

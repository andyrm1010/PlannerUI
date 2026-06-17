import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar } from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { NoticeProvider } from "../../shared/notices/NoticeProvider";
import { CalendarsPage } from "./CalendarsPage";

const unhandledRejectionListeners = new Set<
  (event: PromiseRejectionEvent) => void
>();

const calendars: PlannerCalendar[] = [
  {
    calendarId: "calendar-1",
    ownerUserId: "user-1",
    name: "Work",
    description: "Team schedule",
    colorHex: "#3366FF",
  },
  {
    calendarId: "calendar-2",
    ownerUserId: "user-1",
    name: "Personal",
    description: null,
    colorHex: "#FF6633",
  },
];

function createApi(result: PlannerCalendar[] = calendars) {
  return {
    getCalendars: vi.fn().mockResolvedValue(result),
    createCalendar: vi.fn().mockResolvedValue(calendars[0]),
    updateCalendar: vi.fn().mockResolvedValue(undefined),
    deleteCalendar: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlannerApi;
}

function renderPage(api: PlannerApi, initialUserId = "user-1") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const renderWithProviders = (
    showPage: boolean,
    userId = initialUserId,
  ) => (
    <QueryClientProvider client={client}>
      <NoticeProvider>
        {showPage ? <CalendarsPage api={api} userId={userId} /> : null}
      </NoticeProvider>
    </QueryClientProvider>
  );
  const view = render(renderWithProviders(true));

  return {
    client,
    invalidate,
    removePage: () => view.rerender(renderWithProviders(false)),
    switchUser: (userId: string) =>
      view.rerender(renderWithProviders(true, userId)),
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
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("CalendarsPage", () => {
  it("uses the user query key and renders a loading state", async () => {
    const api = createApi();
    const pending = deferred<PlannerCalendar[]>();
    vi.mocked(api.getCalendars).mockReturnValue(pending.promise);
    const { client } = renderPage(api);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading calendars",
    );
    expect(api.getCalendars).toHaveBeenCalledWith("user-1");

    pending.resolve(calendars);
    await screen.findByRole("list", { name: "Calendars" });
    expect(
      client.getQueryData(["calendars", "user-1"]),
    ).toEqual(calendars);
  });

  it("renders an error with retry and then recovers", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getCalendars)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(calendars);

    renderPage(api);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Unable to load calendars.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("list", { name: "Calendars" }),
    ).toBeVisible();
    expect(api.getCalendars).toHaveBeenCalledTimes(2);
  });

  it("renders the empty state and can open the create dialog", async () => {
    const user = userEvent.setup();
    const api = createApi([]);

    renderPage(api);

    expect(await screen.findByText("No calendars yet.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Create calendar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Create calendar" }),
    ).toBeVisible();
  });

  it("renders semantic cards and toggles visibility without calling the API", async () => {
    const user = userEvent.setup();
    const api = createApi();

    renderPage(api);

    const list = await screen.findByRole("list", { name: "Calendars" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const workCard = within(items[0]).getByRole("article", {
      name: "Work",
    });
    expect(workCard).toHaveTextContent("Team schedule");
    expect(workCard).toHaveTextContent("Color #3366FF");
    expect(
      within(workCard).getByTestId("calendar-color-swatch"),
    ).toHaveAttribute("data-color", "#3366FF");
    const personalCard = within(items[1]).getByRole("article", {
      name: "Personal",
    });
    expect(
      within(personalCard).getByTestId("calendar-color-swatch"),
    ).toHaveAttribute("data-color", "#FF6633");
    expect(
      within(workCard).getByRole("button", { name: "Edit Work" }),
    ).toBeVisible();
    expect(
      within(workCard).getByRole("button", { name: "Delete Work" }),
    ).toHaveClass("button--danger");
    expect(
      screen.getByRole("button", { name: "Create calendar" }),
    ).toHaveClass("button--primary");

    const visibility = within(workCard).getByRole("checkbox", {
      name: "Show Work calendar",
    });
    expect(visibility).toBeChecked();
    const getCalls = vi.mocked(api.getCalendars).mock.calls.length;
    await user.click(visibility);

    expect(visibility).not.toBeChecked();
    expect(api.getCalendars).toHaveBeenCalledTimes(getCalls);
    expect(api.createCalendar).not.toHaveBeenCalled();
    expect(api.updateCalendar).not.toHaveBeenCalled();
    expect(api.deleteCalendar).not.toHaveBeenCalled();
  });

  it("opens the selected calendar for editing", async () => {
    const user = userEvent.setup();
    const api = createApi();

    renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Edit Work" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Edit calendar" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Work",
    );
  });

  it("confirms deletion, invalidates calendars and events, and announces success", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { invalidate } = renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete calendar?" }),
    ).toBeVisible();
    expect(
      screen.getByRole("alertdialog", { name: "Delete calendar?" }),
    ).toHaveAccessibleDescription(
      "Work and its events will be permanently deleted.",
    );
    expect(api.deleteCalendar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(api.deleteCalendar).toHaveBeenCalledWith("calendar-1"),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["events", "user-1"],
    });
    expect(
      screen.queryByRole("alertdialog", { name: "Delete calendar?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Calendar deleted.")).toBeVisible();
  });

  it("keeps the confirmation open and announces a failed deletion", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.deleteCalendar).mockRejectedValue(
      new Error("Delete failed."),
    );

    renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Delete failed.",
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete calendar?" }),
    ).toBeVisible();
  });

  it("locks the confirmation as soon as deletion starts", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingDelete = deferred<void>();
    vi.mocked(api.deleteCalendar).mockReturnValue(pendingDelete.promise);

    renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete calendar?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Delete" }),
    );
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Close" }),
    );

    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledOnce());
    expect(confirmation).toBeVisible();

    pendingDelete.resolve();
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Delete calendar?",
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("stays disabled while delete invalidations reconcile", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const reconciliation = deferred<void>();
    const { invalidate } = renderPage(api);
    invalidate.mockImplementation(() => reconciliation.promise);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete calendar?",
    });
    const confirmDelete = within(confirmation).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(confirmDelete);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(api.deleteCalendar).toHaveBeenCalledOnce();
    expect(confirmDelete).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Close" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create calendar" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit Work" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete Personal" }),
    ).toBeDisabled();

    fireEvent.click(confirmDelete);
    expect(api.deleteCalendar).toHaveBeenCalledOnce();
    expect(confirmation).toBeVisible();

    await act(async () => {
      reconciliation.resolve();
      await reconciliation.promise;
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Delete calendar?",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Create calendar" }),
    ).toBeEnabled();
  });

  it("binds a pending delete to its initiating user and resets scoped UI", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingDelete = deferred<void>();
    vi.mocked(api.deleteCalendar).mockReturnValue(pendingDelete.promise);
    const view = renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Create calendar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Create calendar" }),
    ).toBeVisible();
    view.switchUser("user-2");
    expect(
      screen.queryByRole("dialog", { name: "Create calendar" }),
    ).not.toBeInTheDocument();

    view.switchUser("user-1");
    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledOnce());

    view.switchUser("user-2");
    expect(
      screen.queryByRole("alertdialog", { name: "Delete calendar?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Create calendar" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(view.invalidate).toHaveBeenCalledWith({
      queryKey: ["calendars", "user-1"],
    });
    expect(view.invalidate).toHaveBeenCalledWith({
      queryKey: ["events", "user-1"],
    });
    expect(view.invalidate).not.toHaveBeenCalledWith({
      queryKey: ["calendars", "user-2"],
    });
    expect(view.invalidate).not.toHaveBeenCalledWith({
      queryKey: ["events", "user-2"],
    });
    expect(screen.queryByText("Calendar deleted.")).not.toBeInTheDocument();
  });

  it("ignores a successful delete completion after route unmount", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingDelete = deferred<void>();
    vi.mocked(api.deleteCalendar).mockReturnValue(pendingDelete.promise);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unhandledRejection = trackUnhandledRejections();
    const view = renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledOnce());

    view.removePage();
    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(screen.queryByText("Calendar deleted.")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
  });

  it("ignores a failed delete completion after route unmount", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const pendingDelete = deferred<void>();
    vi.mocked(api.deleteCalendar).mockReturnValue(pendingDelete.promise);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unhandledRejection = trackUnhandledRejections();
    const view = renderPage(api);

    await user.click(
      await screen.findByRole("button", { name: "Delete Work" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledOnce());

    view.removePage();
    await act(async () => {
      pendingDelete.reject(new Error("Delete failed."));
      await pendingDelete.promise.catch(() => undefined);
    });

    expect(screen.queryByText("Delete failed.")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
  });
});

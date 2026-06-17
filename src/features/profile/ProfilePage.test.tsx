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
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerUser } from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import { NoticeProvider } from "../../shared/notices/NoticeProvider";
import { ProfilePage } from "./ProfilePage";

const plannerUser: PlannerUser = {
  userId: "user-1",
  email: "ada@example.test",
  normalizedEmail: "ADA@EXAMPLE.TEST",
  displayName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  timeZoneId: "America/New_York",
  isActive: true,
  createdUtc: "2026-01-02T03:04:05Z",
  updatedUtc: null,
  deletedUtc: null,
  rowVersion: "row-version-1",
};

function createApi(user: PlannerUser | null = plannerUser) {
  return {
    getUser: vi.fn().mockResolvedValue(user),
    updateUser: vi.fn().mockResolvedValue(undefined),
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

function renderPage(api: PlannerApi, userId = "user-1") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const renderWithProviders = (
    showPage: boolean,
    currentUserId = userId,
  ) => (
    <QueryClientProvider client={client}>
      <NoticeProvider>
        {showPage ? (
          <ProfilePage api={api} userId={currentUserId} />
        ) : null}
      </NoticeProvider>
    </QueryClientProvider>
  );
  const view = render(renderWithProviders(true));

  return {
    client,
    invalidate,
    removePage: () => view.rerender(renderWithProviders(false)),
    switchUser: (nextUserId: string) =>
      view.rerender(renderWithProviders(true, nextUserId)),
    ...view,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfilePage", () => {
  it("loads the user with the scoped query key", async () => {
    const pending = deferred<PlannerUser>();
    const api = createApi();
    vi.mocked(api.getUser).mockReturnValue(pending.promise);
    const { client } = renderPage(api);

    expect(screen.getByRole("status")).toHaveTextContent("Loading profile");
    expect(api.getUser).toHaveBeenCalledWith("user-1");

    pending.resolve(plannerUser);
    expect(
      await screen.findByRole("heading", { name: "Profile" }),
    ).toBeVisible();
    expect(client.getQueryData(["user", "user-1"])).toEqual(plannerUser);
  });

  it("renders editable names, read-only account fields, and deferred-editing guidance", async () => {
    const api = createApi();

    renderPage(api);

    expect(
      await screen.findByRole("textbox", { name: "Display name" }),
    ).toHaveValue("Ada Lovelace");
    expect(
      screen.getByRole("textbox", { name: "First name" }),
    ).toHaveValue("Ada");
    expect(
      screen.getByRole("textbox", { name: "Last name" }),
    ).toHaveValue("Lovelace");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue(
      "ada@example.test",
    );
    expect(
      screen.getByRole("textbox", { name: "Time zone" }),
    ).toHaveValue("America/New_York");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByRole("textbox", { name: "Time zone" }),
    ).toHaveAttribute("readonly");
    expect(
      screen.getByText(/email and time-zone editing are planned/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Profile initials")).toHaveTextContent(
      "AL",
    );
  });

  it("derives initials from names, display name, email, and a defensive fallback", async () => {
    const cases = [
      {
        user: { ...plannerUser, firstName: "Ada", lastName: null },
        initials: "A",
      },
      {
        user: {
          ...plannerUser,
          firstName: null,
          lastName: null,
          displayName: "Grace Brewster Hopper",
        },
        initials: "GH",
      },
      {
        user: {
          ...plannerUser,
          firstName: null,
          lastName: null,
          displayName: "",
          email: "linus@example.test",
        },
        initials: "L",
      },
      {
        user: {
          ...plannerUser,
          firstName: null,
          lastName: null,
          displayName: "",
          email: "",
        },
        initials: "?",
      },
    ];

    for (const testCase of cases) {
      const view = renderPage(createApi(testCase.user));
      expect(await screen.findByLabelText("Profile initials")).toHaveTextContent(
        testCase.initials,
      );
      view.unmount();
    }
  });

  it("renders an error with retry and recovers", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getUser)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(plannerUser);

    renderPage(api);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load profile.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("textbox", { name: "Display name" }),
    ).toHaveValue("Ada Lovelace");
    expect(api.getUser).toHaveBeenCalledTimes(2);
  });

  it("keeps a clean cached form after a background refresh failure and recovers on retry", async () => {
    const user = userEvent.setup();
    const refreshedUser: PlannerUser = {
      ...plannerUser,
      displayName: "Ada King",
      lastName: "King",
    };
    const api = createApi();
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockRejectedValueOnce(new Error("Refresh failed."))
      .mockResolvedValueOnce(refreshedUser);
    const { client } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["user", "user-1"],
      });
    });

    expect(displayName).toHaveValue("Ada Lovelace");
    expect(
      screen.getByRole("textbox", { name: "Last name" }),
    ).toHaveValue("Lovelace");
    expect(screen.getByText("Unable to refresh profile.")).toBeVisible();
    expect(
      screen.queryByText("Unable to load profile."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Retry profile refresh" }),
    );

    await waitFor(() => expect(displayName).toHaveValue("Ada King"));
    expect(
      screen.getByRole("textbox", { name: "Last name" }),
    ).toHaveValue("King");
    expect(
      screen.queryByText("Unable to refresh profile."),
    ).not.toBeInTheDocument();
    expect(api.getUser).toHaveBeenCalledTimes(3);
  });

  it("keeps dirty edits after a background refresh failure", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockRejectedValueOnce(new Error("Refresh failed."));
    const { client } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    const firstName = screen.getByRole("textbox", { name: "First name" });
    const lastName = screen.getByRole("textbox", { name: "Last name" });
    await user.clear(displayName);
    await user.type(displayName, "Dirty display");
    await user.clear(firstName);
    await user.type(firstName, "Dirty first");
    await user.clear(lastName);
    await user.type(lastName, "Dirty last");

    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["user", "user-1"],
      });
    });

    expect(displayName).toHaveValue("Dirty display");
    expect(firstName).toHaveValue("Dirty first");
    expect(lastName).toHaveValue("Dirty last");
    expect(
      await screen.findByText("Unable to refresh profile."),
    ).toBeVisible();
    expect(api.getUser).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText("Unable to load profile."),
    ).not.toBeInTheDocument();
  });

  it("renders a defensive not-found state for an empty response", async () => {
    renderPage(createApi(null));

    expect(await screen.findByText("Profile not found.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save profile" }),
    ).not.toBeInTheDocument();
  });

  it("requires a non-blank display name", async () => {
    const user = userEvent.setup();
    const api = createApi();

    renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await user.clear(displayName);
    await user.type(displayName, "   ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Display name is required.")).toBeVisible();
    expect(displayName).toHaveAttribute("aria-invalid", "true");
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it("sends the full user with only trimmed editable fields changed", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const savedUser: PlannerUser = {
      ...plannerUser,
      displayName: "Countess Ada",
      firstName: null,
      lastName: "Byron",
    };
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockResolvedValueOnce(savedUser);
    const { client, invalidate } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    const firstName = screen.getByRole("textbox", { name: "First name" });
    const lastName = screen.getByRole("textbox", { name: "Last name" });
    await user.clear(displayName);
    await user.type(displayName, "  Countess Ada  ");
    await user.clear(firstName);
    await user.type(firstName, "   ");
    await user.clear(lastName);
    await user.type(lastName, "  Byron  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledOnce());
    expect(api.updateUser).toHaveBeenCalledWith("user-1", {
      ...savedUser,
    });
    expect(invalidate).toHaveBeenCalledWith(
      {
        queryKey: ["user", "user-1"],
      },
      { throwOnError: true },
    );
    expect(screen.getByText("Profile updated.")).toBeVisible();
    expect(displayName).toHaveValue("Countess Ada");
    expect(firstName).toHaveValue("");
    expect(lastName).toHaveValue("Byron");

    await act(async () => {
      client.setQueryData(["user", "user-1"], {
        ...savedUser,
        displayName: "Server rename",
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(displayName).toHaveValue("Server rename"),
    );
  });

  it("commits a successful save before failed reconciliation and synchronizes a clean retry", async () => {
    const user = userEvent.setup();
    const retryUser: PlannerUser = {
      ...plannerUser,
      displayName: "Server retry name",
      firstName: "Server",
      lastName: "Retry",
      rowVersion: "row-version-2",
    };
    const backgroundUser: PlannerUser = {
      ...retryUser,
      displayName: "Later background name",
      rowVersion: "row-version-3",
    };
    const api = createApi();
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockRejectedValueOnce(new Error("Refresh failed."))
      .mockResolvedValueOnce(retryUser)
      .mockResolvedValueOnce(backgroundUser);
    const { client, invalidate } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await user.clear(displayName);
    await user.type(displayName, "  Saved locally  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(
      await screen.findByText("Unable to refresh profile."),
    ).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith(
      {
        queryKey: ["user", "user-1"],
      },
      { throwOnError: true },
    );
    expect(displayName).toHaveValue("Saved locally");
    expect(client.getQueryData(["user", "user-1"])).toEqual({
      ...plannerUser,
      displayName: "Saved locally",
    });
    expect(
      screen.queryByText("Unable to load profile."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Profile updated.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save profile" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Retry profile refresh" }),
    );

    await waitFor(() =>
      expect(displayName).toHaveValue("Server retry name"),
    );
    expect(
      screen.getByRole("textbox", { name: "First name" }),
    ).toHaveValue("Server");
    expect(
      screen.getByRole("textbox", { name: "Last name" }),
    ).toHaveValue("Retry");
    expect(
      screen.queryByText("Unable to refresh profile."),
    ).not.toBeInTheDocument();

    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["user", "user-1"],
      });
    });

    await waitFor(() =>
      expect(displayName).toHaveValue("Later background name"),
    );
  });

  it("preserves a new dirty edit when retrying failed save reconciliation", async () => {
    const user = userEvent.setup();
    const retryUser: PlannerUser = {
      ...plannerUser,
      displayName: "Server retry name",
      firstName: "Server",
      lastName: "Retry",
      rowVersion: "row-version-2",
    };
    const api = createApi();
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockRejectedValueOnce(new Error("Refresh failed."))
      .mockResolvedValueOnce(retryUser);
    renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await user.clear(displayName);
    await user.type(displayName, "Committed name");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(
      await screen.findByText("Unable to refresh profile."),
    ).toBeVisible();
    expect(displayName).toHaveValue("Committed name");

    await user.clear(displayName);
    await user.type(displayName, "New dirty edit");
    await user.click(
      screen.getByRole("button", { name: "Retry profile refresh" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Unable to refresh profile."),
      ).not.toBeInTheDocument(),
    );
    expect(displayName).toHaveValue("New dirty edit");
    expect(api.getUser).toHaveBeenCalledTimes(3);
  });

  it("normalizes a rate-limit error and preserves entered values", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateUser).mockRejectedValue(
      new ApiError(429, "Rate limited", undefined, 9),
    );

    renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    const firstName = screen.getByRole("textbox", { name: "First name" });
    await user.clear(displayName);
    await user.type(displayName, "  Keep this name  ");
    await user.clear(firstName);
    await user.type(firstName, "  Kept  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again in 9 seconds.",
    );
    expect(displayName).toHaveValue("  Keep this name  ");
    expect(firstName).toHaveValue("  Kept  ");
  });

  it("preserves all edits and becomes usable after a generic update failure", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateUser).mockRejectedValue(
      new Error("Unable to update profile."),
    );
    const { invalidate } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    const firstName = screen.getByRole("textbox", { name: "First name" });
    const lastName = screen.getByRole("textbox", { name: "Last name" });
    const save = screen.getByRole("button", { name: "Save profile" });
    await user.clear(displayName);
    await user.type(displayName, "  Display edit  ");
    await user.clear(firstName);
    await user.type(firstName, "  First edit  ");
    await user.clear(lastName);
    await user.type(lastName, "  Last edit  ");
    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update profile.",
    );
    expect(displayName).toHaveValue("  Display edit  ");
    expect(firstName).toHaveValue("  First edit  ");
    expect(lastName).toHaveValue("  Last edit  ");
    expect(displayName).toBeEnabled();
    expect(firstName).toBeEnabled();
    expect(lastName).toBeEnabled();
    expect(save).toBeEnabled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("prevents duplicate saves and stays pending through invalidation", async () => {
    const api = createApi();
    const update = deferred<void>();
    const reconciliation = deferred<void>();
    vi.mocked(api.updateUser).mockReturnValue(update.promise);
    const { invalidate } = renderPage(api);
    invalidate.mockImplementation(() => reconciliation.promise);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    const firstName = screen.getByRole("textbox", { name: "First name" });
    const lastName = screen.getByRole("textbox", { name: "Last name" });
    const save = screen.getByRole("button", { name: "Save profile" });
    const form = save.closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("aria-busy", "false");

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledOnce());
    expect(save).toHaveTextContent("Saving...");
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(displayName).toBeDisabled();
    expect(firstName).toBeDisabled();
    expect(lastName).toBeDisabled();
    expect(save).toBeDisabled();

    await act(async () => {
      update.resolve();
      await update.promise;
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());

    expect(save).toHaveTextContent("Saving...");
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(save).toBeDisabled();
    fireEvent.submit(form!);
    expect(api.updateUser).toHaveBeenCalledOnce();
    expect(screen.getByText("Profile updated.")).toBeVisible();
    expect(save).toHaveTextContent("Saving...");
    expect(form).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      reconciliation.resolve();
      await reconciliation.promise;
    });

    expect(await screen.findByText("Profile updated.")).toBeVisible();
    expect(save).toHaveTextContent("Save profile");
    expect(form).toHaveAttribute("aria-busy", "false");
    expect(save).toBeEnabled();
  });

  it("resets for a new user and suppresses stale completion effects", async () => {
    const user = userEvent.setup();
    const secondUser: PlannerUser = {
      ...plannerUser,
      userId: "user-2",
      email: "grace@example.test",
      normalizedEmail: "GRACE@EXAMPLE.TEST",
      displayName: "Grace Hopper",
      firstName: "Grace",
      lastName: "Hopper",
      rowVersion: "row-version-2",
    };
    const api = createApi();
    vi.mocked(api.getUser).mockImplementation((id) =>
      Promise.resolve(id === "user-1" ? plannerUser : secondUser),
    );
    const update = deferred<void>();
    vi.mocked(api.updateUser).mockReturnValue(update.promise);
    const view = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await user.clear(displayName);
    await user.type(displayName, "User one edit");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledOnce());

    view.switchUser("user-2");

    expect(
      await screen.findByRole("textbox", { name: "Display name" }),
    ).toHaveValue("Grace Hopper");
    const newSave = screen.getByRole("button", { name: "Save profile" });
    expect(newSave).toBeEnabled();
    expect(newSave).toHaveTextContent("Save profile");
    expect(newSave.closest("form")).toHaveAttribute("aria-busy", "false");

    await act(async () => {
      update.resolve();
      await update.promise;
    });

    expect(api.updateUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        userId: "user-1",
        displayName: "User one edit",
      }),
    );
    expect(view.invalidate).toHaveBeenCalledWith(
      {
        queryKey: ["user", "user-1"],
      },
      { throwOnError: true },
    );
    expect(view.invalidate).not.toHaveBeenCalledWith(
      {
        queryKey: ["user", "user-2"],
      },
      { throwOnError: true },
    );
    expect(screen.queryByText("Profile updated.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Display name" }),
    ).toHaveValue("Grace Hopper");
  });

  it("suppresses a failed save notice after unmount", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const update = deferred<void>();
    vi.mocked(api.updateUser).mockReturnValue(update.promise);
    const view = renderPage(api);

    await screen.findByRole("textbox", { name: "Display name" });
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledOnce());

    view.removePage();
    await act(async () => {
      update.reject(new Error("Save failed."));
      await update.promise.catch(() => undefined);
    });

    expect(screen.queryByText("Save failed.")).not.toBeInTheDocument();
  });

  it("does not overwrite dirty edits during a background query update", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getUser)
      .mockResolvedValueOnce(plannerUser)
      .mockResolvedValueOnce({
        ...plannerUser,
        displayName: "Background update",
      });
    const { client } = renderPage(api);

    const displayName = await screen.findByRole("textbox", {
      name: "Display name",
    });
    await user.clear(displayName);
    await user.type(displayName, "My unsaved edit");

    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["user", "user-1"],
      });
    });

    expect(api.getUser).toHaveBeenCalledTimes(2);
    expect(displayName).toHaveValue("My unsaved edit");
  });
});

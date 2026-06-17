import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerApi } from "../api/plannerApi";
import { renderWithProviders } from "../test/renderWithProviders";
import { App } from "./App";
import { AppProviders } from "./AppProviders";

const calendarsPageMock = vi.hoisted(() => ({
  props: undefined as
    | {
        api: PlannerApi;
        userId: string;
      }
    | undefined,
}));

const profilePageMock = vi.hoisted(() => ({
  props: undefined as
    | {
        api: PlannerApi;
        userId: string;
      }
    | undefined,
}));

vi.mock("../features/calendar/CalendarPage", () => ({
  CalendarPage: () => <h1>Calendar</h1>,
}));

vi.mock("../features/calendars/CalendarsPage", () => ({
  CalendarsPage: (props: { api: PlannerApi; userId: string }) => {
    calendarsPageMock.props = props;
    return <h1>Calendars</h1>;
  },
}));

vi.mock("../features/profile/ProfilePage", () => ({
  ProfilePage: (props: { api: PlannerApi; userId: string }) => {
    profilePageMock.props = props;
    return <h1>Profile</h1>;
  },
}));

const validConfig = {
  apiBaseUrl: "https://api.example.test",
  demoUserId: "0f4a0034-9e1c-4b66-a4f4-8890c3d32f86",
};

afterEach(() => {
  cleanup();
  calendarsPageMock.props = undefined;
  profilePageMock.props = undefined;
  vi.unstubAllGlobals();
});

function QueryClientProbe({
  onClient,
}: {
  onClient: (client: QueryClient) => void;
}) {
  const client = useQueryClient();

  useEffect(() => {
    onClient(client);
  }, [client, onClient]);

  return <span>Provider ready</span>;
}

describe("App", () => {
  it("announces route loading while a lazy page resolves", () => {
    vi.stubGlobal("fetch", vi.fn());

    renderWithProviders(<App config={validConfig} />, {
      route: "/calendar",
    });

    expect(screen.getByRole("status")).toHaveTextContent("Loading page");
  });

  it("shows every runtime configuration error on an accessible setup screen", () => {
    const errors = [
      "VITE_API_BASE_URL is required.",
      "VITE_DEMO_USER_ID must be a valid UUID.",
    ];

    renderWithProviders(<App config={{ errors }} />);

    expect(
      screen.getByRole("heading", { name: "Planner setup required" }),
    ).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(errors.length);

    for (const error of errors) {
      expect(screen.getByText(error)).toBeVisible();
    }
  });

  it("redirects the root route to Calendar and links a missing route back", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = renderWithProviders(<App config={validConfig} />, {
      route: "/",
    });

    expect(
      await screen.findByRole("heading", { name: "Calendar" }),
    ).toBeVisible();

    view.unmount();
    renderWithProviders(<App config={validConfig} />, {
      route: "/missing",
    });

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    await user.click(screen.getByRole("link", { name: "Go to Calendar" }));
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wires the configured API and demo user into the calendars route", async () => {
    renderWithProviders(<App config={validConfig} />, {
      route: "/calendars",
    });

    expect(
      await screen.findByRole("heading", { name: "Calendars" }),
    ).toBeVisible();
    expect(calendarsPageMock.props?.userId).toBe(validConfig.demoUserId);
    expect(calendarsPageMock.props?.api.getCalendars).toEqual(
      expect.any(Function),
    );
  });

  it("wires the configured API and demo user into the profile route", async () => {
    renderWithProviders(<App config={validConfig} />, {
      route: "/profile",
    });

    expect(
      await screen.findByRole("heading", { name: "Profile" }),
    ).toBeVisible();
    expect(profilePageMock.props?.userId).toBe(validConfig.demoUserId);
    expect(profilePageMock.props?.api.getUser).toEqual(
      expect.any(Function),
    );
  });
});

describe("AppProviders", () => {
  it("keeps one QueryClient per mount with the application defaults", () => {
    const clients: QueryClient[] = [];
    const captureClient = (client: QueryClient) => clients.push(client);
    const view = render(
      <AppProviders>
        <QueryClientProbe onClient={captureClient} />
      </AppProviders>,
    );
    const firstClient = clients.at(-1);

    view.rerender(
      <AppProviders>
        <QueryClientProbe onClient={captureClient} />
      </AppProviders>,
    );

    expect(clients.at(-1)).toBe(firstClient);
    expect(firstClient?.getDefaultOptions().queries).toMatchObject({
      retry: false,
      staleTime: 30_000,
    });
    expect(firstClient?.getDefaultOptions().mutations).toMatchObject({
      retry: false,
    });
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
  });
});

describe("renderWithProviders", () => {
  it("creates a fresh QueryClient and supports caller-supplied routes", () => {
    const clients: QueryClient[] = [];
    const captureClient = (client: QueryClient) => clients.push(client);
    const renderRoute = () =>
      renderWithProviders(
        <Routes>
          <Route
            path="/custom"
            element={<QueryClientProbe onClient={captureClient} />}
          />
        </Routes>,
        { route: "/custom" },
      );

    const firstView = renderRoute();
    expect(screen.getByText("Provider ready")).toBeVisible();
    const firstClient = clients.at(-1);
    firstView.unmount();

    const secondView = renderRoute();
    const secondClient = clients.at(-1);
    secondView.unmount();

    expect(firstClient).toBeDefined();
    expect(secondClient).toBeDefined();
    expect(secondClient).not.toBe(firstClient);
    expect(firstClient?.getDefaultOptions().queries).toMatchObject({
      retry: false,
      staleTime: 30_000,
    });
    expect(firstClient?.getDefaultOptions().mutations).toMatchObject({
      retry: false,
    });
  });
});

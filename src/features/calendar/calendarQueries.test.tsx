import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerApi } from "../../api/plannerApi";
import {
  queryKeys,
  useCalendars,
  useEvents,
  type CalendarRange,
} from "./calendarQueries";

afterEach(() => {
  cleanup();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function createApi() {
  return {
    getCalendars: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
  } as unknown as PlannerApi;
}

describe("calendar query keys", () => {
  it("uses exact prefix-friendly tuples", () => {
    expect(queryKeys.user("user-1")).toEqual(["user", "user-1"]);
    expect(queryKeys.calendars("user-1")).toEqual([
      "calendars",
      "user-1",
    ]);
    expect(
      queryKeys.events("user-1", "2026-06-01", "2026-07-01"),
    ).toEqual([
      "events",
      "user-1",
      "2026-06-01",
      "2026-07-01",
    ]);
  });
});

describe("calendar queries", () => {
  it("loads calendars for the supplied user", async () => {
    const api = createApi();

    renderHook(() => useCalendars(api, "user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(api.getCalendars).toHaveBeenCalledWith("user-1"),
    );
  });

  it("does not load events until both user and range are available", () => {
    const api = createApi();
    const range: CalendarRange = {
      startUtc: "2026-06-01T00:00:00.000Z",
      endUtc: "2026-07-01T00:00:00.000Z",
    };

    const { rerender } = renderHook(
      ({ userId, visibleRange }) =>
        useEvents(api, userId, visibleRange),
      {
        initialProps: {
          userId: undefined as string | undefined,
          visibleRange: undefined as CalendarRange | undefined,
        },
        wrapper: createWrapper(),
      },
    );

    rerender({ userId: "user-1", visibleRange: undefined });
    expect(api.getEvents).not.toHaveBeenCalled();

    rerender({ userId: "user-1", visibleRange: range });
    expect(api.getEvents).toHaveBeenCalledWith(
      "user-1",
      range.startUtc,
      range.endUtc,
    );
  });
});

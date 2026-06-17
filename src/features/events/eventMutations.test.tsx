import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import {
  normalizeEventMutationError,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from "./eventMutations";

function setup(api: PlannerApi) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");

  return {
    client,
    invalidate,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    api,
  };
}

describe("event mutations", () => {
  it("creates, updates, and deletes through PlannerApi and invalidates the user prefix", async () => {
    const api = {
      createEvent: vi.fn().mockResolvedValue({ eventId: "event-1" }),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlannerApi;
    const context = setup(api);
    const create = renderHook(() => useCreateEvent(api, "user-1"), context);
    const update = renderHook(() => useUpdateEvent(api, "user-1"), context);
    const remove = renderHook(() => useDeleteEvent(api, "user-1"), context);
    const createInput = {
      calendarId: "work",
      createdByUserId: "user-1",
      title: "Review",
      description: null,
      startUtc: "2026-06-12T13:00:00.000Z",
      endUtc: "2026-06-12T14:00:00.000Z",
      isAllDay: false,
    };
    const updateInput = {
      calendarId: "work",
      title: "Updated review",
      description: null,
      startUtc: createInput.startUtc,
      endUtc: createInput.endUtc,
      isAllDay: false,
    };

    create.result.current.mutate(createInput);
    await waitFor(() => expect(create.result.current.isSuccess).toBe(true));
    update.result.current.mutate({ eventId: "event-1", input: updateInput });
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true));
    remove.result.current.mutate("event-1");
    await waitFor(() => expect(remove.result.current.isSuccess).toBe(true));

    expect(api.createEvent).toHaveBeenCalledWith(createInput);
    expect(api.updateEvent).toHaveBeenCalledWith("event-1", updateInput);
    expect(api.deleteEvent).toHaveBeenCalledWith("event-1");
    expect(context.invalidate).toHaveBeenCalledTimes(3);
    expect(context.invalidate).toHaveBeenCalledWith({
      queryKey: ["events", "user-1"],
    });
  });

  it("normalizes rate-limit and API problem messages", () => {
    expect(
      normalizeEventMutationError(
        new ApiError(429, "Rate limited", undefined, 12),
      ),
    ).toBe("Too many requests. Try again in 12 seconds.");
    expect(
      normalizeEventMutationError(new ApiError(429, "Rate limited")),
    ).toBe("Too many requests. Try again.");
    expect(
      normalizeEventMutationError(
        new ApiError(400, "Bad request", "Calendar is unavailable."),
      ),
    ).toBe("Calendar is unavailable.");
    expect(normalizeEventMutationError(new Error("Network failed."))).toBe(
      "Network failed.",
    );
  });
});

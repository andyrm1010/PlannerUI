import type { EventApi } from "@fullcalendar/core";
import { describe, expect, it, vi } from "vitest";
import type { PlannerEvent } from "../../api/contracts";
import {
  EventInteractionBusyError,
  isEventInteractionPending,
  persistEventInteraction,
} from "./eventInteraction";

const plannerEvent: PlannerEvent = {
  eventId: "event-1",
  calendarId: "calendar-1",
  createdByUserId: "user-1",
  title: "Project review",
  description: "Discuss launch.",
  startUtc: "2026-06-12T14:00:00.000Z",
  endUtc: "2026-06-12T15:00:00.000Z",
  isAllDay: false,
};

function interactionEvent(
  overrides: Partial<{
    allDay: boolean;
    end: Date | null;
    extendedProps: Record<string, unknown>;
    id: string;
    start: Date | null;
  }> = {},
) {
  return {
    id: plannerEvent.eventId,
    start: new Date("2026-06-13T16:00:00.000Z"),
    end: new Date("2026-06-13T17:30:00.000Z"),
    allDay: false,
    extendedProps: { plannerEvent },
    ...overrides,
  } as EventApi;
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

function runEventInteraction(
  interaction: Omit<
    Parameters<typeof persistEventInteraction>[0],
    "reconcile"
  > & {
    reconcile?: () => Promise<unknown>;
  },
) {
  return persistEventInteraction({
    reconcile: async () => undefined,
    ...interaction,
  });
}

describe("persistEventInteraction", () => {
  it("persists a timed interaction with original content fields and FullCalendar dates", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const revert = vi.fn();

    await runEventInteraction({
      event: interactionEvent(),
      revert,
      update,
    });

    expect(update).toHaveBeenCalledWith("event-1", {
      calendarId: "calendar-1",
      title: "Project review",
      description: "Discuss launch.",
      startUtc: "2026-06-13T16:00:00.000Z",
      endUtc: "2026-06-13T17:30:00.000Z",
      isAllDay: false,
    });
    expect(revert).not.toHaveBeenCalled();
  });

  it("uses a one-hour timed end when FullCalendar has no end", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await runEventInteraction({
      event: interactionEvent({
        start: new Date("2026-06-13T16:15:00.000Z"),
        end: null,
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        startUtc: "2026-06-13T16:15:00.000Z",
        endUtc: "2026-06-13T17:15:00.000Z",
      }),
    );
  });

  it("normalizes a timed event moved to all-day UTC date boundaries", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await runEventInteraction({
      event: interactionEvent({
        allDay: true,
        start: new Date(2026, 5, 20),
        end: new Date(2026, 5, 22),
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        startUtc: "2026-06-20T00:00:00.000Z",
        endUtc: "2026-06-22T00:00:00.000Z",
        isAllDay: true,
      }),
    );
  });

  it("uses the next UTC date when an all-day interaction has no end", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await runEventInteraction({
      event: interactionEvent({
        allDay: true,
        start: new Date(2026, 5, 20),
        end: null,
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        startUtc: "2026-06-20T00:00:00.000Z",
        endUtc: "2026-06-21T00:00:00.000Z",
        isAllDay: true,
      }),
    );
  });

  it("persists an all-day event moved to a timed slot as timed", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const originalAllDay = { ...plannerEvent, isAllDay: true };

    await runEventInteraction({
      event: interactionEvent({
        allDay: false,
        start: new Date("2026-06-20T13:00:00.000Z"),
        end: new Date("2026-06-20T14:00:00.000Z"),
        extendedProps: { plannerEvent: originalAllDay },
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        startUtc: "2026-06-20T13:00:00.000Z",
        endUtc: "2026-06-20T14:00:00.000Z",
        isAllDay: false,
      }),
    );
  });

  it("reverts exactly once and rethrows when the update fails", async () => {
    const error = new Error("Update failed.");
    const revert = vi.fn();

    const result = runEventInteraction({
      event: interactionEvent(),
      revert,
      update: vi.fn().mockRejectedValue(error),
    });

    expect(isEventInteractionPending("event-1")).toBe(true);
    await expect(result).rejects.toBe(error);

    expect(revert).toHaveBeenCalledOnce();
    expect(isEventInteractionPending("event-1")).toBe(false);
  });

  it("does not mask an update error when rollback also throws", async () => {
    const updateError = new Error("Update failed.");
    const revert = vi.fn(() => {
      throw new Error("Rollback failed.");
    });

    await expect(
      runEventInteraction({
        event: interactionEvent(),
        revert,
        update: vi.fn().mockRejectedValue(updateError),
      }),
    ).rejects.toBe(updateError);

    expect(revert).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "missing planner event",
      event: interactionEvent({ extendedProps: {} }),
    },
    {
      name: "malformed planner event",
      event: interactionEvent({
        extendedProps: {
          plannerEvent: { ...plannerEvent, calendarId: 42 },
        },
      }),
    },
    {
      name: "missing start",
      event: interactionEvent({ start: null }),
    },
  ])("reverts a local mapping error for $name", async ({ event }) => {
    const revert = vi.fn();
    const update = vi.fn();

    await expect(
      runEventInteraction({ event, revert, update }),
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
    expect(revert).toHaveBeenCalledOnce();
  });

  it("rejects a second same-event interaction while the first is pending", async () => {
    const firstUpdate = deferred<void>();
    const update = vi.fn().mockReturnValue(firstUpdate.promise);
    const firstRevert = vi.fn();
    const secondRevert = vi.fn();

    const first = runEventInteraction({
      event: interactionEvent(),
      revert: firstRevert,
      update,
    });
    const second = runEventInteraction({
      event: interactionEvent({
        start: new Date("2026-06-13T18:00:00.000Z"),
      }),
      revert: secondRevert,
      update,
    });

    await expect(second).rejects.toBeInstanceOf(
      EventInteractionBusyError,
    );
    expect(update).toHaveBeenCalledOnce();
    expect(secondRevert).toHaveBeenCalledOnce();
    expect(firstRevert).not.toHaveBeenCalled();
    expect(isEventInteractionPending("event-1")).toBe(true);

    const firstError = new Error("First update failed.");
    firstUpdate.reject(firstError);
    await expect(first).rejects.toBe(firstError);
    expect(firstRevert).toHaveBeenCalledOnce();
    expect(secondRevert).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(isEventInteractionPending("event-1")).toBe(false);
  });

  it("releases the lock after success so a later interaction can run", async () => {
    const update = vi.fn().mockResolvedValue(undefined);

    await runEventInteraction({
      event: interactionEvent(),
      revert: vi.fn(),
      update,
    });
    await runEventInteraction({
      event: interactionEvent({
        start: new Date("2026-06-13T18:00:00.000Z"),
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(isEventInteractionPending("event-1")).toBe(false);
  });

  it("keeps the lock through one reconciliation after update success", async () => {
    const reconciliation = deferred<void>();
    const reconcile = vi.fn().mockReturnValue(reconciliation.promise);

    const result = runEventInteraction({
      event: interactionEvent(),
      revert: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      reconcile,
    });

    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(isEventInteractionPending("event-1")).toBe(true);

    reconciliation.resolve();
    await expect(result).resolves.toBeUndefined();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(isEventInteractionPending("event-1")).toBe(false);
  });

  it("reconciles once after update failure and releases only afterward", async () => {
    const updateError = new Error("Update failed.");
    const reconciliation = deferred<void>();
    const reconcile = vi.fn().mockReturnValue(reconciliation.promise);
    const revert = vi.fn();

    const result = runEventInteraction({
      event: interactionEvent(),
      revert,
      update: vi.fn().mockRejectedValue(updateError),
      reconcile,
    });

    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(revert).toHaveBeenCalledOnce();
    expect(isEventInteractionPending("event-1")).toBe(true);

    reconciliation.resolve();
    await expect(result).rejects.toBe(updateError);
    expect(reconcile).toHaveBeenCalledOnce();
    expect(isEventInteractionPending("event-1")).toBe(false);
  });

  it("preserves the update error when reconciliation also fails", async () => {
    const updateError = new Error("Update failed.");
    const reconciliationError = new Error("Reconciliation failed.");

    await expect(
      runEventInteraction({
        event: interactionEvent(),
        revert: vi.fn(),
        update: vi.fn().mockRejectedValue(updateError),
        reconcile: vi.fn().mockRejectedValue(reconciliationError),
      }),
    ).rejects.toBe(updateError);
  });

  it("surfaces reconciliation failure after a successful update", async () => {
    const reconciliationError = new Error("Reconciliation failed.");

    await expect(
      runEventInteraction({
        event: interactionEvent(),
        revert: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        reconcile: vi.fn().mockRejectedValue(reconciliationError),
      }),
    ).rejects.toBe(reconciliationError);
  });

  it("allows different event ids to update independently", async () => {
    const firstUpdate = deferred<void>();
    const secondUpdate = deferred<void>();
    const secondPlannerEvent = {
      ...plannerEvent,
      eventId: "event-2",
    };
    const update = vi.fn((eventId: string) =>
      eventId === "event-1"
        ? firstUpdate.promise
        : secondUpdate.promise,
    );

    const first = runEventInteraction({
      event: interactionEvent(),
      revert: vi.fn(),
      update,
    });
    const second = runEventInteraction({
      event: interactionEvent({
        id: "event-2",
        extendedProps: { plannerEvent: secondPlannerEvent },
      }),
      revert: vi.fn(),
      update,
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(isEventInteractionPending("event-1")).toBe(true);
    expect(isEventInteractionPending("event-2")).toBe(true);

    firstUpdate.resolve();
    secondUpdate.resolve();
    await Promise.all([first, second]);
    expect(isEventInteractionPending("event-1")).toBe(false);
    expect(isEventInteractionPending("event-2")).toBe(false);
  });
});

import type { EventApi } from "@fullcalendar/core";
import type {
  PlannerEvent,
  UpdateEventInput,
} from "../../api/contracts";

type EventInteraction = {
  event: Pick<
    EventApi,
    "allDay" | "end" | "extendedProps" | "start"
  >;
  revert: () => void;
  update: (
    eventId: string,
    input: UpdateEventInput,
  ) => Promise<unknown>;
  reconcile: () => Promise<unknown>;
};

const pendingEventIds = new Set<string>();

export class EventInteractionBusyError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super("An event interaction is already pending.");
    this.name = "EventInteractionBusyError";
    this.eventId = eventId;
  }
}

export function isEventInteractionPending(eventId: string): boolean {
  return pendingEventIds.has(eventId);
}

function isPlannerEvent(value: unknown): value is PlannerEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event.eventId === "string" &&
    typeof event.calendarId === "string" &&
    typeof event.createdByUserId === "string" &&
    typeof event.title === "string" &&
    (typeof event.description === "string" ||
      event.description === null) &&
    typeof event.startUtc === "string" &&
    typeof event.endUtc === "string" &&
    typeof event.isAllDay === "boolean"
  );
}

function requireValidDate(value: Date | null, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Event interaction is missing a valid ${field}.`);
  }
  return value;
}

function toUtcDateBoundary(value: Date): Date {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

function toUpdateInput(
  event: EventInteraction["event"],
  plannerEvent: PlannerEvent,
): UpdateEventInput {
  const start = requireValidDate(event.start, "start");

  if (event.allDay) {
    const startBoundary = toUtcDateBoundary(start);
    const endBoundary = event.end
      ? toUtcDateBoundary(requireValidDate(event.end, "end"))
      : new Date(startBoundary.getTime() + 24 * 60 * 60 * 1000);

    return {
      calendarId: plannerEvent.calendarId,
      title: plannerEvent.title,
      description: plannerEvent.description,
      startUtc: startBoundary.toISOString(),
      endUtc: endBoundary.toISOString(),
      isAllDay: true,
    };
  }

  const end = event.end
    ? requireValidDate(event.end, "end")
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    calendarId: plannerEvent.calendarId,
    title: plannerEvent.title,
    description: plannerEvent.description,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    isAllDay: false,
  };
}

export function persistEventInteraction({
  event,
  revert,
  update,
  reconcile,
}: EventInteraction): Promise<void> {
  let reverted = false;
  const revertOnce = () => {
    if (!reverted) {
      reverted = true;
      try {
        revert();
      } catch {
        // Preserve the interaction error that triggered the rollback.
      }
    }
  };

  const plannerEvent = event.extendedProps.plannerEvent;
  let input: UpdateEventInput;

  try {
    if (!isPlannerEvent(plannerEvent)) {
      throw new Error(
        "Event interaction is missing a valid planner event.",
      );
    }
    if (pendingEventIds.has(plannerEvent.eventId)) {
      throw new EventInteractionBusyError(plannerEvent.eventId);
    }
    input = toUpdateInput(event, plannerEvent);
  } catch (error) {
    revertOnce();
    return Promise.reject(error);
  }

  pendingEventIds.add(plannerEvent.eventId);

  return (async () => {
    let updateFailed = false;
    let updateError: unknown;

    try {
      try {
        await update(plannerEvent.eventId, input);
      } catch (error) {
        updateFailed = true;
        updateError = error;
        revertOnce();
      }

      try {
        await reconcile();
      } catch (reconciliationError) {
        if (updateFailed) {
          throw updateError;
        }
        throw reconciliationError;
      }

      if (updateFailed) {
        throw updateError;
      }
    } finally {
      pendingEventIds.delete(plannerEvent.eventId);
    }
  })();
}

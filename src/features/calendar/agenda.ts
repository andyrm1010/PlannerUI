import type { PlannerEvent } from "../../api/contracts";
import { localDayBoundsUtc } from "./dateMapping";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getAgendaEvents(
  events: PlannerEvent[],
  selectedDate: string,
  visibleCalendarIds?: ReadonlySet<string>,
): PlannerEvent[] {
  const { startUtc, endUtc } = localDayBoundsUtc(selectedDate);
  const dayStart = new Date(startUtc).getTime();
  const dayEnd = new Date(endUtc).getTime();

  return events
    .filter((event) => {
      if (
        visibleCalendarIds &&
        !visibleCalendarIds.has(event.calendarId)
      ) {
        return false;
      }

      const eventStart = new Date(event.startUtc).getTime();
      const eventEnd = new Date(event.endUtc).getTime();
      // Invalid and non-positive event ranges are omitted so one malformed
      // record cannot prevent the rest of the agenda from rendering.
      if (
        !Number.isFinite(eventStart) ||
        !Number.isFinite(eventEnd) ||
        eventEnd <= eventStart
      ) {
        return false;
      }

      if (event.isAllDay) {
        const startDate = new Date(eventStart)
          .toISOString()
          .slice(0, 10);
        const endDate = new Date(eventEnd).toISOString().slice(0, 10);
        return startDate <= selectedDate && selectedDate < endDate;
      }

      return eventStart < dayEnd && eventEnd > dayStart;
    })
    .sort((left, right) => {
      if (left.isAllDay !== right.isAllDay) {
        return left.isAllDay ? -1 : 1;
      }

      const startDifference =
        new Date(left.startUtc).getTime() -
        new Date(right.startUtc).getTime();
      return (
        startDifference ||
        compareText(left.title, right.title) ||
        compareText(left.eventId, right.eventId)
      );
    });
}

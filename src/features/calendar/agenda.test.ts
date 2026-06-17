import { describe, expect, it } from "vitest";
import type { PlannerEvent } from "../../api/contracts";
import { getAgendaEvents } from "./agenda";

function createEvent(
  overrides: Partial<PlannerEvent> & Pick<PlannerEvent, "eventId">,
): PlannerEvent {
  return {
    calendarId: "work",
    createdByUserId: "user-1",
    title: overrides.eventId,
    description: null,
    startUtc: "2026-06-12T14:00:00.000Z",
    endUtc: "2026-06-12T15:00:00.000Z",
    isAllDay: false,
    ...overrides,
  };
}

function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day);
}

describe("getAgendaEvents", () => {
  it("includes timed events that overlap the selected local day", () => {
    const dayStart = localDate(2026, 5, 12);
    const dayEnd = localDate(2026, 5, 13);
    const events = [
      createEvent({
        eventId: "spans-start",
        startUtc: new Date(dayStart.getTime() - 60_000).toISOString(),
        endUtc: new Date(dayStart.getTime() + 60_000).toISOString(),
      }),
      createEvent({
        eventId: "inside",
        startUtc: new Date(dayStart.getTime() + 3_600_000).toISOString(),
        endUtc: new Date(dayStart.getTime() + 7_200_000).toISOString(),
      }),
      createEvent({
        eventId: "spans-end",
        startUtc: new Date(dayEnd.getTime() - 60_000).toISOString(),
        endUtc: new Date(dayEnd.getTime() + 60_000).toISOString(),
      }),
    ];

    expect(
      getAgendaEvents(events, "2026-06-12").map(
        (event) => event.eventId,
      ),
    ).toEqual(["spans-start", "inside", "spans-end"]);
  });

  it("uses half-open boundaries for timed events", () => {
    const dayStart = localDate(2026, 5, 12);
    const dayEnd = localDate(2026, 5, 13);
    const events = [
      createEvent({
        eventId: "ends-at-start",
        startUtc: new Date(dayStart.getTime() - 3_600_000).toISOString(),
        endUtc: dayStart.toISOString(),
      }),
      createEvent({
        eventId: "starts-at-end",
        startUtc: dayEnd.toISOString(),
        endUtc: new Date(dayEnd.getTime() + 3_600_000).toISOString(),
      }),
    ];

    expect(getAgendaEvents(events, "2026-06-12")).toEqual([]);
  });

  it("compares all-day events using exclusive UTC date boundaries", () => {
    const oneDay = createEvent({
      eventId: "one-day",
      isAllDay: true,
      startUtc: "2026-06-12T00:00:00.000Z",
      endUtc: "2026-06-13T00:00:00.000Z",
    });

    expect(getAgendaEvents([oneDay], "2026-06-11")).toEqual([]);
    expect(getAgendaEvents([oneDay], "2026-06-12")).toEqual([oneDay]);
    expect(getAgendaEvents([oneDay], "2026-06-13")).toEqual([]);
  });

  it("returns events only from visible calendars when supplied", () => {
    const visible = createEvent({ eventId: "visible" });
    const hidden = createEvent({
      eventId: "hidden",
      calendarId: "personal",
    });

    expect(
      getAgendaEvents(
        [hidden, visible],
        "2026-06-12",
        new Set(["work"]),
      ),
    ).toEqual([visible]);
  });

  it("sorts all-day first, then by start, title, and id", () => {
    const events = [
      createEvent({
        eventId: "timed-z",
        title: "Zulu",
        startUtc: "2026-06-12T16:00:00.000Z",
        endUtc: "2026-06-12T17:00:00.000Z",
      }),
      createEvent({
        eventId: "timed-b",
        title: "Alpha",
        startUtc: "2026-06-12T14:00:00.000Z",
        endUtc: "2026-06-12T15:00:00.000Z",
      }),
      createEvent({
        eventId: "timed-a",
        title: "Alpha",
        startUtc: "2026-06-12T14:00:00.000Z",
        endUtc: "2026-06-12T15:00:00.000Z",
      }),
      createEvent({
        eventId: "all-day",
        title: "All day",
        isAllDay: true,
        startUtc: "2026-06-12T00:00:00.000Z",
        endUtc: "2026-06-13T00:00:00.000Z",
      }),
    ];

    expect(
      getAgendaEvents(events, "2026-06-12").map(
        (event) => event.eventId,
      ),
    ).toEqual(["all-day", "timed-a", "timed-b", "timed-z"]);
  });

  it("excludes invalid dates and non-positive ranges without throwing", () => {
    const valid = createEvent({ eventId: "valid" });
    const invalidStart = createEvent({
      eventId: "invalid-start",
      startUtc: "not-a-date",
    });
    const invalidEnd = createEvent({
      eventId: "invalid-end",
      endUtc: "not-a-date",
    });
    const backwards = createEvent({
      eventId: "backwards",
      startUtc: "2026-06-12T15:00:00.000Z",
      endUtc: "2026-06-12T14:00:00.000Z",
    });

    expect(() =>
      getAgendaEvents(
        [invalidStart, invalidEnd, backwards, valid],
        "2026-06-12",
      ),
    ).not.toThrow();
    expect(
      getAgendaEvents(
        [invalidStart, invalidEnd, backwards, valid],
        "2026-06-12",
      ),
    ).toEqual([valid]);
  });
});

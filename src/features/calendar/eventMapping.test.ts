import { describe, expect, it } from "vitest";
import type { PlannerCalendar, PlannerEvent } from "../../api/contracts";
import {
  getAccessibleEventTextColor,
  getContrastRatio,
  toFullCalendarEvent,
} from "./eventMapping";

const plannerEvent: PlannerEvent = {
  eventId: "event-1",
  calendarId: "calendar-1",
  createdByUserId: "user-1",
  title: "Project review",
  description: "Review the launch checklist",
  startUtc: "2026-06-12T14:30:00.000Z",
  endUtc: "2026-06-12T15:30:00.000Z",
  isAllDay: false,
};

const plannerCalendar: PlannerCalendar = {
  calendarId: "calendar-1",
  ownerUserId: "user-1",
  name: "Work",
  description: null,
  colorHex: "#3366FF",
};

describe("toFullCalendarEvent", () => {
  it("maps a planner event and calendar to a FullCalendar event", () => {
    const eventBefore = structuredClone(plannerEvent);
    const calendarBefore = structuredClone(plannerCalendar);

    expect(toFullCalendarEvent(plannerEvent, plannerCalendar)).toEqual({
      id: "event-1",
      title: "Project review",
      start: "2026-06-12T14:30:00.000Z",
      end: "2026-06-12T15:30:00.000Z",
      allDay: false,
      backgroundColor: "#3366FF",
      borderColor: "#3366FF",
      textColor: "#FFFFFF",
      extendedProps: {
        plannerEvent,
        calendarName: "Work",
      },
    });
    expect(plannerEvent).toEqual(eventBefore);
    expect(plannerCalendar).toEqual(calendarBefore);
  });

  it("uses the fallback color when the calendar color is null", () => {
    const calendarWithoutColor = {
      ...plannerCalendar,
      colorHex: null,
    };

    expect(
      toFullCalendarEvent(plannerEvent, calendarWithoutColor),
    ).toMatchObject({
      backgroundColor: "#6C63E8",
      borderColor: "#6C63E8",
      textColor: "#000000",
    });
  });

  it.each([
    ["#FFFFFF", "#000000"],
    ["#FFF4A3", "#000000"],
    ["#6C63E8", "#000000"],
    ["#182044", "#FFFFFF"],
    ["#777777", "#000000"],
  ])(
    "selects an accessible foreground for %s",
    (background, expectedForeground) => {
      const foreground = getAccessibleEventTextColor(background);

      expect(foreground).toBe(expectedForeground);
      expect(getContrastRatio(background, foreground)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it("guarantees at least 4.5 contrast across a broad RGB lattice", () => {
    const channelValues = Array.from(
      { length: 17 },
      (_, index) => Math.round((index * 255) / 16),
    );

    for (const red of channelValues) {
      for (const green of channelValues) {
        for (const blue of channelValues) {
          const background = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()}`;
          const foreground = getAccessibleEventTextColor(background);

          expect(
            getContrastRatio(background, foreground),
            `${background} with ${foreground}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("maps accessible dark text for a light calendar color", () => {
    const lightCalendar = {
      ...plannerCalendar,
      colorHex: "#FFF4A3",
    };

    expect(toFullCalendarEvent(plannerEvent, lightCalendar)).toMatchObject({
      backgroundColor: "#FFF4A3",
      borderColor: "#FFF4A3",
      textColor: "#000000",
    });
  });
});

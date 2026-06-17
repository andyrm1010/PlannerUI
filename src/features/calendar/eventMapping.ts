import type { EventInput } from "@fullcalendar/core";
import type { PlannerCalendar, PlannerEvent } from "../../api/contracts";

const fallbackCalendarColor = "#6C63E8";
const blackEventText = "#000000";
const lightEventText = "#FFFFFF";

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid six-digit hex color: ${color}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(colorA: string, colorB: string): number {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

export function getAccessibleEventTextColor(
  backgroundColor: string,
): "#000000" | "#FFFFFF" {
  const darkContrast = getContrastRatio(backgroundColor, blackEventText);
  const lightContrast = getContrastRatio(backgroundColor, lightEventText);

  // Their contrast product is always 21, so the larger ratio exceeds sqrt(21).
  return darkContrast >= lightContrast ? blackEventText : lightEventText;
}

export function toFullCalendarEvent(
  event: PlannerEvent,
  calendar: PlannerCalendar,
): EventInput {
  const color = calendar.colorHex ?? fallbackCalendarColor;

  return {
    id: event.eventId,
    title: event.title,
    start: event.startUtc,
    end: event.endUtc,
    allDay: event.isAllDay,
    backgroundColor: color,
    borderColor: color,
    textColor: getAccessibleEventTextColor(color),
    extendedProps: {
      plannerEvent: event,
      calendarName: calendar.name,
    },
  };
}

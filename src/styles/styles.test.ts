import { describe, expect, it } from "vitest";
import main from "../main.tsx?raw";
import appCss from "./app.css?raw";
import fullCalendarCss from "./fullcalendar.css?raw";
import tokensCss from "./tokens.css?raw";

function ruleFor(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1];
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .match(/\w\w/g)!
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );

    return (
      0.2126 * channels[0] +
      0.7152 * channels[1] +
      0.0722 * channels[2]
    );
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe("Bright Productivity styling contract", () => {
  it("defines the approved palette and shared visual tokens", () => {
    const css = tokensCss;

    expect(css).toContain("--color-bg: #f1f3ff");
    expect(css).toContain("--color-surface: #ffffff");
    expect(css).toContain("--color-surface-muted: #f7f8ff");
    expect(css).toContain("--color-text: #182044");
    expect(css).toContain("--color-text-muted: #66708f");
    expect(css).toContain("--color-primary: #6c63e8");
    expect(css).toContain("--color-primary-strong: #554bcf");
    expect(css).toContain("--color-accent: #f05f8a");
    expect(css).toContain("--color-success: #25a58e");
    expect(css).toContain("--color-danger: #c83f61");
    expect(css).toContain("--color-danger-foreground: #9b2448");
    expect(css).toContain("--color-border: #e1e4f2");
    expect(css).toMatch(/--shadow-card:/);
    expect(css).toMatch(/--radius-(sm|md|lg):/);
    expect(css).toMatch(/--focus-ring:/);
  });

  it("includes responsive, touch, focus, dialog, and motion safeguards", () => {
    const css = appCss;

    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(
      "@media (min-width: 768px) and (max-width: 1099px)",
    );
    expect(css).toContain("@media (min-width: 1100px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(".app-navigation--mobile");
    expect(css).toContain('[data-mobile-active="false"]');
    expect(css).toContain(".event-dialog");
    expect(css).toContain(".calendar-dialog");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("overflow-x: hidden");
  });

  it("gives the calendar-card visibility control a 44px target", () => {
    const rule = ruleFor(appCss, ".calendar-card > label");

    expect(rule).toBeDefined();
    expect(rule).toMatch(/min-height:\s*44px/);
  });

  it("styles FullCalendar states without suppressing accessible text", () => {
    const css = fullCalendarCss;

    expect(css).toContain(".fc-col-header-cell");
    expect(css).toContain(".fc-day-today");
    expect(css).toContain(".fc-event");
    expect(css).toContain(".fc-timegrid-now-indicator-line");
    expect(css).toContain(".fc-popover");
    expect(css).toContain(".fc-more-link");
    expect(css).toContain(":focus-visible");
    expect(css).not.toMatch(
      /\.fc-(?:event-title|col-header-cell-cushion)[^{]*\{[^}]*display:\s*none/s,
    );
    expect(ruleFor(css, ".planner-calendar .fc-event")).not.toMatch(
      /color:\s*#ffffff/i,
    );
  });

  it("keeps month events compact while preserving large day and agenda targets", () => {
    const dayGridHarness = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-daygrid-event-harness",
    );
    const dayGridEventRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-daygrid-event",
    );
    const eventRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-event",
    );
    const timeGridEventRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-timegrid-event",
    );
    const moreLinkRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-more-link",
    );
    const dayBottomRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-daygrid-day-bottom",
    );
    const timeGridSlotRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-timegrid-slot",
    );
    const agendaEventRule = ruleFor(
      appCss,
      ".selected-day-agenda__event",
    );

    expect(dayGridHarness ?? "").not.toMatch(/(?:min-)?height:\s*44px/);
    expect(dayGridEventRule).not.toMatch(/(?:min-)?height:\s*44px/);
    expect(dayGridEventRule).toMatch(/width:\s*100%/);
    expect(eventRule).not.toMatch(/min-height:/);
    expect(eventRule).not.toMatch(/min-width:/);
    expect(eventRule).toMatch(/padding:\s*0\.08rem\s+0\.25rem/);
    expect(timeGridEventRule ?? "").not.toMatch(/min-height:/);
    expect(timeGridEventRule ?? "").not.toMatch(/min-width:/);
    expect(moreLinkRule).not.toMatch(/min-height:\s*44px/);
    expect(moreLinkRule).not.toMatch(/min-width:\s*44px/);
    expect(dayBottomRule ?? "").not.toMatch(/min-height:\s*44px/);
    expect(timeGridSlotRule).toMatch(/height:\s*44px/);
    expect(agendaEventRule).toMatch(/min-height:\s*(?:44px|4\.65rem)/);
  });

  it("keeps styled day selection links at least 44px", () => {
    const dayNumberRule = ruleFor(
      fullCalendarCss,
      ".planner-calendar .fc-daygrid-day-number",
    );
    const mobileCss = fullCalendarCss.slice(
      fullCalendarCss.indexOf("@media (max-width: 767px)"),
    );
    const mobileDayNumberRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc-daygrid-day-number",
    );

    expect(dayNumberRule).toMatch(/min-width:\s*44px/);
    expect(dayNumberRule).toMatch(/min-height:\s*44px/);
    expect(mobileDayNumberRule).not.toMatch(
      /min-(?:width|height):\s*(?:1\.75rem|[0-3]\dpx)/,
    );
  });

  it("keeps the mobile more-link target inside its day cell", () => {
    const mobileCss = fullCalendarCss.slice(
      fullCalendarCss.indexOf("@media (max-width: 767px)"),
    );
    const dayBottomRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc-daygrid-day-bottom",
    );
    const moreLinkRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc-more-link",
    );

    expect(dayBottomRule).toMatch(/margin-inline:\s*0/);
    expect(moreLinkRule).toMatch(/font-size:\s*0\.68rem/);
    expect(moreLinkRule).toMatch(/padding-inline:\s*0(?:;|\s)/);
  });

  it("contains a minimum-width mobile month grid in one horizontal scroller", () => {
    const desktopCss = fullCalendarCss.slice(
      0,
      fullCalendarCss.indexOf("@media (max-width: 767px)"),
    );
    const desktopMonthHarnessRule = ruleFor(
      desktopCss,
      ".planner-calendar .fc .fc-view-harness:has(.fc-dayGridMonth-view)",
    );
    const mobileCss = fullCalendarCss.slice(
      fullCalendarCss.indexOf("@media (max-width: 767px)"),
    );
    const monthHarnessRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc .fc-view-harness:has(.fc-dayGridMonth-view)",
    );
    const monthViewRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc .fc-dayGridMonth-view",
    );
    const timeGridWeekRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc .fc-timeGridWeek-view",
    );
    const timeGridDayRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc .fc-timeGridDay-view",
    );

    expect(desktopMonthHarnessRule).toMatch(/min-height:\s*39rem/);
    expect(monthHarnessRule).toMatch(/overflow-x:\s*auto/);
    expect(monthHarnessRule).toMatch(/overflow-y:\s*hidden/);
    expect(monthHarnessRule).toMatch(
      /overscroll-behavior-inline:\s*contain/,
    );
    expect(monthHarnessRule).toMatch(/min-height:\s*39rem/);
    expect(monthViewRule).toMatch(/min-width:\s*23rem/);
    expect(timeGridWeekRule ?? "").not.toMatch(/min-width:/);
    expect(timeGridDayRule ?? "").not.toMatch(/min-width:/);
  });

  it("keeps mobile day-grid event width inside its cell margins", () => {
    const mobileCss = fullCalendarCss.slice(
      fullCalendarCss.indexOf("@media (max-width: 767px)"),
    );
    const dayGridEventRule = ruleFor(
      mobileCss,
      ".planner-calendar .fc-daygrid-event",
    );

    expect(dayGridEventRule).toMatch(/margin-inline:\s*1px/);
    expect(dayGridEventRule).toMatch(
      /width:\s*calc\(100%\s*-\s*2px\)/,
    );
  });

  it("uses semantic primary and danger classes with accessible contrast", () => {
    const dangerForeground = "#9b2448";
    const dangerSoft = "#fff0f3";
    const danger = "#c83f61";
    const primaryRule = ruleFor(appCss, ".button--primary");
    const dangerRule = ruleFor(appCss, ".button--danger");
    const dangerHoverRule = ruleFor(
      appCss,
      ".button--danger:hover:not(:disabled)",
    );

    expect(primaryRule).toMatch(/background:/);
    expect(dangerRule).toMatch(
      /color:\s*var\(--color-danger-foreground\)/,
    );
    expect(dangerHoverRule).toMatch(/background:\s*var\(--color-danger\)/);
    expect(dangerHoverRule).toMatch(/color:\s*#ffffff/i);
    expect(contrastRatio(dangerForeground, dangerSoft)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio("#ffffff", danger)).toBeGreaterThanOrEqual(4.5);
    expect(appCss).not.toContain(".calendar-card > button:last-child");
    expect(appCss).not.toContain(
      ".planner-calendar__toolbar > button:last-child",
    );
  });

  it("lets the document contract below its 20rem desktop minimum", () => {
    expect(fullCalendarCss).toContain("@media (max-width: 20rem)");
    expect(fullCalendarCss).toMatch(
      /html,\s*body\s*\{[^}]*min-width:\s*0/s,
    );
  });

  it("imports local styles in dependency order from the application entry", () => {
    const tokenImport = main.indexOf('import "./styles/tokens.css"');
    const appImport = main.indexOf('import "./styles/app.css"');
    const calendarImport = main.indexOf(
      'import "./styles/fullcalendar.css"',
    );

    expect(tokenImport).toBeGreaterThan(-1);
    expect(appImport).toBeGreaterThan(tokenImport);
    expect(calendarImport).toBeGreaterThan(appImport);
  });
});

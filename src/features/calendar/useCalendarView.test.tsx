import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCalendarView } from "./useCalendarView";

const storageKey = "planner.calendar.view";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useCalendarView", () => {
  it("defaults to the month view when nothing is stored", () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current[0]).toBe("dayGridMonth");
  });

  it("restores a valid stored view", () => {
    window.localStorage.setItem(storageKey, "timeGridWeek");

    const { result } = renderHook(() => useCalendarView());

    expect(result.current[0]).toBe("timeGridWeek");
  });

  it("falls back to the month view for an invalid stored value", () => {
    window.localStorage.setItem(storageKey, "agendaYear");

    const { result } = renderHook(() => useCalendarView());

    expect(result.current[0]).toBe("dayGridMonth");
  });

  it("updates and persists the selected view", () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => result.current[1]("timeGridDay"));

    expect(result.current[0]).toBe("timeGridDay");
    expect(window.localStorage.getItem(storageKey)).toBe("timeGridDay");
  });
});

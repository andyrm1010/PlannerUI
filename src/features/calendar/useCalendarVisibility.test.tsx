import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalendarVisibility } from "./useCalendarVisibility";

const storageKey = "planner.calendar.hiddenIds";

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useCalendarVisibility", () => {
  it("shows every calendar by default", () => {
    const { result } = renderHook(() =>
      useCalendarVisibility(["work", "personal"]),
    );

    expect([...result.current.hiddenIds]).toEqual([]);
    expect([...result.current.visibleIds]).toEqual(["work", "personal"]);
  });

  it("restores only string hidden ids from a stored JSON array", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(["work", 42, null, "personal", { id: "other" }]),
    );

    const { result } = renderHook(() =>
      useCalendarVisibility(["work", "personal", "new"]),
    );

    expect([...result.current.hiddenIds]).toEqual(["work", "personal"]);
    expect([...result.current.visibleIds]).toEqual(["new"]);
  });

  it.each(["not json", JSON.stringify({ hidden: ["work"] })])(
    "ignores malformed stored visibility: %s",
    (storedValue) => {
      window.localStorage.setItem(storageKey, storedValue);

      const { result } = renderHook(() =>
        useCalendarVisibility(["work"]),
      );

      expect([...result.current.hiddenIds]).toEqual([]);
      expect([...result.current.visibleIds]).toEqual(["work"]);
    },
  );

  it("keeps newly supplied calendars visible unless explicitly hidden", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["work"]));
    const { result, rerender } = renderHook(
      ({ calendarIds }) => useCalendarVisibility(calendarIds),
      { initialProps: { calendarIds: ["work"] } },
    );

    rerender({ calendarIds: ["work", "new"] });

    expect([...result.current.hiddenIds]).toEqual(["work"]);
    expect([...result.current.visibleIds]).toEqual(["new"]);
  });

  it("toggles hidden ids and persists the complete hidden set", () => {
    const { result } = renderHook(() =>
      useCalendarVisibility(["work", "personal"]),
    );

    act(() => result.current.toggle("work"));

    expect([...result.current.hiddenIds]).toEqual(["work"]);
    expect([...result.current.visibleIds]).toEqual(["personal"]);
    expect(window.localStorage.getItem(storageKey)).toBe(
      JSON.stringify(["work"]),
    );

    act(() => result.current.toggle("work"));

    expect([...result.current.hiddenIds]).toEqual([]);
    expect([...result.current.visibleIds]).toEqual(["work", "personal"]);
    expect(window.localStorage.getItem(storageKey)).toBe("[]");
  });

  it("persists once under StrictMode and restores after remount", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const firstRender = renderHook(
      () => useCalendarVisibility(["work", "personal"]),
      { wrapper: StrictModeWrapper },
    );

    act(() => firstRender.result.current.toggle("work"));

    expect(setItemSpy).toHaveBeenCalledOnce();
    expect(setItemSpy).toHaveBeenCalledWith(
      storageKey,
      JSON.stringify(["work"]),
    );
    firstRender.unmount();

    const secondRender = renderHook(() =>
      useCalendarVisibility(["work", "personal"]),
    );
    expect([...secondRender.result.current.hiddenIds]).toEqual(["work"]);
    expect([...secondRender.result.current.visibleIds]).toEqual([
      "personal",
    ]);
  });

  it("keeps hidden preferences when calendars are removed and reappear", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["work"]));
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result, rerender } = renderHook(
      ({ calendarIds }) => useCalendarVisibility(calendarIds),
      { initialProps: { calendarIds: ["work", "personal"] } },
    );

    rerender({ calendarIds: ["personal"] });

    expect([...result.current.hiddenIds]).toEqual(["work"]);
    expect([...result.current.visibleIds]).toEqual(["personal"]);
    expect(setItemSpy).not.toHaveBeenCalled();

    rerender({ calendarIds: ["work", "personal"] });

    expect([...result.current.hiddenIds]).toEqual(["work"]);
    expect([...result.current.visibleIds]).toEqual(["personal"]);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("does not rewrite malformed storage during initial hydration", () => {
    window.localStorage.setItem(storageKey, "not json");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderHook(() => useCalendarVisibility(["work"]));

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });

    const { result } = renderHook(() =>
      useCalendarVisibility(["work"]),
    );

    expect([...result.current.visibleIds]).toEqual(["work"]);
    expect(() => act(() => result.current.toggle("work"))).not.toThrow();
    expect([...result.current.hiddenIds]).toEqual(["work"]);
  });
});

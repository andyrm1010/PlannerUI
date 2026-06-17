import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "../../shared/storage";

export type CalendarView =
  | "dayGridMonth"
  | "timeGridWeek"
  | "timeGridDay";

const storageKey = "planner.calendar.view";
const defaultView: CalendarView = "dayGridMonth";
const validViews = new Set<CalendarView>([
  "dayGridMonth",
  "timeGridWeek",
  "timeGridDay",
]);

function restoreView(): CalendarView {
  const storedView = readStorage(storageKey);
  return validViews.has(storedView as CalendarView)
    ? (storedView as CalendarView)
    : defaultView;
}

export function useCalendarView(): [
  CalendarView,
  (view: CalendarView) => void,
] {
  const [view, setViewState] = useState<CalendarView>(restoreView);
  const setView = useCallback((nextView: CalendarView) => {
    setViewState(nextView);
    writeStorage(storageKey, nextView);
  }, []);

  return [view, setView];
}

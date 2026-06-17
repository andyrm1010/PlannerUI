import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readStorage, writeStorage } from "../../shared/storage";

const storageKey = "planner.calendar.hiddenIds";

function restoreHiddenIds(): Set<string> {
  const storedValue = readStorage(storageKey);
  if (!storedValue) {
    return new Set();
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    return Array.isArray(parsedValue)
      ? new Set(parsedValue.filter((value): value is string =>
          typeof value === "string",
        ))
      : new Set();
  } catch {
    return new Set();
  }
}

export function useCalendarVisibility(calendarIds: string[]) {
  const [hiddenIds, setHiddenIds] = useState(restoreHiddenIds);
  const hiddenIdsRef = useRef(hiddenIds);
  const hasPendingPersistence = useRef(false);
  const visibleIds = useMemo(
    () => new Set(calendarIds.filter((id) => !hiddenIds.has(id))),
    [calendarIds, hiddenIds],
  );

  useEffect(() => {
    hiddenIdsRef.current = hiddenIds;
    if (!hasPendingPersistence.current) {
      return;
    }

    hasPendingPersistence.current = false;
    writeStorage(storageKey, JSON.stringify([...hiddenIds]));
  }, [hiddenIds]);

  const toggle = useCallback((calendarId: string) => {
    const nextIds = new Set(hiddenIdsRef.current);
    if (nextIds.has(calendarId)) {
      nextIds.delete(calendarId);
    } else {
      nextIds.add(calendarId);
    }

    hiddenIdsRef.current = nextIds;
    hasPendingPersistence.current = true;
    setHiddenIds(nextIds);
  }, []);

  return { hiddenIds, visibleIds, toggle };
}

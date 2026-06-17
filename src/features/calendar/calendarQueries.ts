import { useQuery } from "@tanstack/react-query";
import type { PlannerApi } from "../../api/plannerApi";

export type CalendarRange = {
  startUtc: string;
  endUtc: string;
};

export const queryKeys = {
  user: (userId: string) => ["user", userId] as const,
  calendars: (userId: string) => ["calendars", userId] as const,
  events: (userId: string, startUtc: string, endUtc: string) =>
    ["events", userId, startUtc, endUtc] as const,
};

export function useCalendars(
  api: PlannerApi,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.calendars(userId ?? ""),
    queryFn: () => api.getCalendars(userId!),
    enabled: Boolean(userId),
  });
}

export function useEvents(
  api: PlannerApi,
  userId: string | undefined,
  range: CalendarRange | undefined,
) {
  return useQuery({
    queryKey: queryKeys.events(
      userId ?? "",
      range?.startUtc ?? "",
      range?.endUtc ?? "",
    ),
    queryFn: () =>
      api.getEvents(userId!, range!.startUtc, range!.endUtc),
    enabled: Boolean(userId && range),
  });
}

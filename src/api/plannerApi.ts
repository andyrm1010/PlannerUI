import type {
  CreateCalendarInput,
  CreateEventInput,
  PagedResult,
  PlannerCalendar,
  PlannerEvent,
  PlannerUser,
  UpdateCalendarInput,
  UpdateEventInput,
} from "./contracts";
import { request } from "./http";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePagedResult<T>(value: unknown): PagedResult<T> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Malformed paginated response.");
  }

  const result = value as Record<string, unknown>;
  if (
    !Array.isArray(result.items) ||
    typeof result.totalCount !== "number" ||
    !Number.isInteger(result.totalCount) ||
    result.totalCount < 0 ||
    !isPositiveInteger(result.page) ||
    !isPositiveInteger(result.pageSize)
  ) {
    throw new Error("Malformed paginated response.");
  }

  return value as PagedResult<T>;
}

export function createPlannerApi(baseUrl: string) {
  const apiUrl = (path: string) => `${baseUrl}${path}`;

  async function getAllPages<T>(path: string, pageSize: number): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    while (true) {
      const separator = path.includes("?") ? "&" : "?";
      const result = parsePagedResult<T>(
        await request<unknown>(
          apiUrl(`${path}${separator}page=${page}&pageSize=${pageSize}`),
        ),
      );

      if (result.page !== page || result.pageSize !== pageSize) {
        throw new Error("Malformed paginated response.");
      }

      items.push(...result.items);

      if (items.length >= result.totalCount) {
        return items;
      }

      if (result.items.length === 0) {
        throw new Error(
          "Pagination made no forward progress before reaching totalCount.",
        );
      }

      page += 1;
    }
  }

  return {
    getUser: (id: string) =>
      request<PlannerUser>(
        apiUrl(`/api/Users/${encodeURIComponent(id)}`),
      ),
    updateUser: (id: string, user: PlannerUser) =>
      request<void>(
        apiUrl(`/api/Users/${encodeURIComponent(id)}`),
        {
          method: "PUT",
          body: JSON.stringify(user),
        },
      ),
    getCalendars: (ownerUserId: string) =>
      getAllPages<PlannerCalendar>(
        `/api/Calendars?ownerUserId=${encodeURIComponent(ownerUserId)}`,
        200,
      ),
    createCalendar: (input: CreateCalendarInput) =>
      request<PlannerCalendar>(apiUrl("/api/Calendars"), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateCalendar: (id: string, input: UpdateCalendarInput) =>
      request<void>(apiUrl(`/api/Calendars/${id}`), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    deleteCalendar: (id: string) =>
      request<void>(apiUrl(`/api/Calendars/${id}`), {
        method: "DELETE",
      }),
    getEvents: (ownerUserId: string, startUtc: string, endUtc: string) =>
      getAllPages<PlannerEvent>(
        `/api/Events?ownerUserId=${encodeURIComponent(ownerUserId)}&startUtc=${encodeURIComponent(startUtc)}&endUtc=${encodeURIComponent(endUtc)}`,
        500,
      ),
    createEvent: (input: CreateEventInput) =>
      request<PlannerEvent>(apiUrl("/api/Events"), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateEvent: (id: string, input: UpdateEventInput) =>
      request<void>(apiUrl(`/api/Events/${id}`), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    deleteEvent: (id: string) =>
      request<void>(apiUrl(`/api/Events/${id}`), {
        method: "DELETE",
      }),
  };
}

export type PlannerApi = ReturnType<typeof createPlannerApi>;

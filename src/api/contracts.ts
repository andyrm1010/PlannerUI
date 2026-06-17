export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PlannerUser = {
  userId: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  timeZoneId: string;
  isActive: boolean;
  createdUtc: string;
  updatedUtc: string | null;
  deletedUtc: string | null;
  rowVersion: string | null;
};

export type PlannerCalendar = {
  calendarId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  colorHex: string | null;
};

export type PlannerEvent = {
  eventId: string;
  calendarId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  startUtc: string;
  endUtc: string;
  isAllDay: boolean;
};

export type CreateCalendarInput = Omit<PlannerCalendar, "calendarId">;
export type UpdateCalendarInput = Pick<
  PlannerCalendar,
  "name" | "description" | "colorHex"
>;
export type CreateEventInput = Omit<PlannerEvent, "eventId">;
export type UpdateEventInput = Omit<
  PlannerEvent,
  "eventId" | "createdByUserId"
>;

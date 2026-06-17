const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const utcMidnightPattern =
  /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;
const MIN_SUPPORTED_YEAR = 1;
const MAX_SUPPORTED_YEAR = 9998;
const supportedYearError =
  "Calendar year must be between 0001 and 9998.";

type DateParts = {
  year: number;
  monthIndex: number;
  day: number;
};

function parseDateOnlyParts(value: string): DateParts {
  const match = dateOnlyPattern.exec(value);
  if (!match) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  return { year, monthIndex, day };
}

function assertSupportedYear(year: number): void {
  if (year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
    throw new RangeError(supportedYearError);
  }
}

function parseDateOnly(value: string): DateParts {
  const parts = parseDateOnlyParts(value);
  assertSupportedYear(parts.year);
  return parts;
}

function parseDateTime(value: string): Date {
  const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1];
  if (datePrefix) {
    parseDateOnlyParts(datePrefix);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid datetime value: ${value}`);
  }

  return date;
}

function parseUtcMidnight(value: string, fieldName: string): Date {
  const match = utcMidnightPattern.exec(value);
  if (!match) {
    throw new RangeError(
      `${fieldName} must be an exact UTC midnight ending in Z.`,
    );
  }

  parseDateOnlyParts(match[1]);
  return new Date(value);
}

function parseLocalDateTime(value: string): Date {
  const match = localDateTimePattern.exec(value);
  if (!match) {
    throw new RangeError(`Invalid local datetime value: ${value}`);
  }

  const { year, monthIndex, day } = parseDateOnly(
    `${match[1]}-${match[2]}-${match[3]}`,
  );
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const date = new Date(0);
  date.setFullYear(year, monthIndex, day);
  // Native Date picks the earlier compatible fall-back occurrence; the
  // component round trip below rejects nonexistent spring-gap local times.
  date.setHours(hours, minutes, 0, 0);

  if (
    hours > 23 ||
    minutes > 59 ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    throw new RangeError(`Invalid local datetime value: ${value}`);
  }

  return date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function allDayDatesToUtc(
  startDate: string,
  inclusiveEndDate: string,
) {
  parseDateOnly(startDate);
  const endParts = parseDateOnly(inclusiveEndDate);
  if (inclusiveEndDate < startDate) {
    throw new RangeError(
      "Inclusive all-day end date must not be before start date.",
    );
  }

  const exclusiveEnd = new Date(0);
  exclusiveEnd.setUTCFullYear(
    endParts.year,
    endParts.monthIndex,
    endParts.day,
  );
  exclusiveEnd.setUTCHours(0, 0, 0, 0);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);

  return {
    startUtc: `${startDate}T00:00:00.000Z`,
    endUtc: exclusiveEnd.toISOString(),
  };
}

export function utcAllDayToDates(
  startUtc: string,
  exclusiveEndUtc: string,
) {
  const start = parseUtcMidnight(startUtc, "startUtc");
  const inclusiveEnd = parseUtcMidnight(
    exclusiveEndUtc,
    "exclusiveEndUtc",
  );
  if (inclusiveEnd.getTime() <= start.getTime()) {
    throw new RangeError(
      "Exclusive all-day end UTC must be after start UTC.",
    );
  }

  const startDate = start.toISOString().slice(0, 10);
  parseDateOnly(startDate);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  const endDate = inclusiveEnd.toISOString().slice(0, 10);
  parseDateOnly(endDate);

  return {
    startDate,
    endDate,
  };
}

export function toLocalDateTimeInput(utc: string) {
  const date = parseDateTime(utc);
  assertSupportedYear(date.getFullYear());

  return [
    String(date.getFullYear()).padStart(4, "0"),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

export function localDateTimeToUtc(value: string) {
  return parseLocalDateTime(value).toISOString();
}

export function localDayBoundsUtc(dateValue: string) {
  const { year, monthIndex, day } = parseDateOnly(dateValue);
  const start = new Date(0);
  start.setFullYear(year, monthIndex, day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

import { describe, expect, it } from "vitest";
import {
  allDayDatesToUtc,
  localDateTimeToUtc,
  localDayBoundsUtc,
  toLocalDateTimeInput,
  utcAllDayToDates,
} from "./dateMapping";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateTimeInputValue(date: Date): string {
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

describe("date mapping", () => {
  const supportedYearError =
    "Calendar year must be between 0001 and 9998.";

  it("maps inclusive all-day dates to UTC with an exclusive end", () => {
    expect(allDayDatesToUtc("2026-06-12", "2026-06-12")).toEqual({
      startUtc: "2026-06-12T00:00:00.000Z",
      endUtc: "2026-06-13T00:00:00.000Z",
    });
  });

  it("rejects an inclusive all-day end date before the start date", () => {
    expect(() =>
      allDayDatesToUtc("2026-06-13", "2026-06-12"),
    ).toThrow(
      new RangeError(
        "Inclusive all-day end date must not be before start date.",
      ),
    );
  });

  it("maps UTC all-day boundaries back to inclusive dates", () => {
    expect(
      utcAllDayToDates(
        "2026-06-12T00:00:00Z",
        "2026-06-13T00:00:00Z",
      ),
    ).toEqual({
      startDate: "2026-06-12",
      endDate: "2026-06-12",
    });
  });

  it("maps the maximum supported all-day date through a year-9999 exclusive boundary", () => {
    const utcRange = allDayDatesToUtc("9998-12-31", "9998-12-31");

    expect(utcRange).toEqual({
      startUtc: "9998-12-31T00:00:00.000Z",
      endUtc: "9999-01-01T00:00:00.000Z",
    });
    expect(
      utcAllDayToDates(utcRange.startUtc, utcRange.endUtc),
    ).toEqual({
      startDate: "9998-12-31",
      endDate: "9998-12-31",
    });
  });

  it.each([
    "2026-06-12T00:00:00.000Z",
    "2026-06-11T00:00:00Z",
  ])(
    "rejects all-day exclusive UTC end %s at or before the start",
    (exclusiveEndUtc) => {
      expect(() =>
        utcAllDayToDates("2026-06-12T00:00:00Z", exclusiveEndUtc),
      ).toThrow(
        new RangeError(
          "Exclusive all-day end UTC must be after start UTC.",
        ),
      );
    },
  );

  it.each([
    [
      "2026-06-12T01:00:00Z",
      "2026-06-13T00:00:00Z",
      "startUtc must be an exact UTC midnight ending in Z.",
    ],
    [
      "2026-06-12T00:00:00+00:00",
      "2026-06-13T00:00:00Z",
      "startUtc must be an exact UTC midnight ending in Z.",
    ],
    [
      "2026-06-12T00:00:00Z",
      "2026-06-13T01:00:00Z",
      "exclusiveEndUtc must be an exact UTC midnight ending in Z.",
    ],
    [
      "2026-06-12T00:00:00Z",
      "2026-06-13T00:00:00+00:00",
      "exclusiveEndUtc must be an exact UTC midnight ending in Z.",
    ],
  ])(
    "rejects noncanonical all-day UTC boundaries %#",
    (startUtc, exclusiveEndUtc, message) => {
      expect(() =>
        utcAllDayToDates(startUtc, exclusiveEndUtc),
      ).toThrow(new RangeError(message));
    },
  );

  it("formats a UTC datetime for a local datetime input", () => {
    const utc = "2026-06-12T14:30:00Z";

    expect(toLocalDateTimeInput(utc)).toBe(
      localDateTimeInputValue(new Date(utc)),
    );
  });

  it("pads local years below 1000 to four digits", () => {
    const instant = new Date(0);
    instant.setUTCFullYear(42, 5, 12);
    instant.setUTCHours(14, 30, 0, 0);

    expect(toLocalDateTimeInput(instant.toISOString())).toBe(
      localDateTimeInputValue(instant),
    );
  });

  it.each([0, 9999])(
    "rejects a converted local year outside the supported domain: %s",
    (utcYear) => {
      const instant = new Date(0);
      instant.setUTCFullYear(utcYear, 5, 12);
      instant.setUTCHours(12, 0, 0, 0);
      expect(instant.getFullYear()).toBe(utcYear);

      expect(() =>
        toLocalDateTimeInput(instant.toISOString()),
      ).toThrow(new RangeError(supportedYearError));
    },
  );

  it("maps a local datetime input to UTC", () => {
    const value = "2026-06-12T14:30";

    expect(localDateTimeToUtc(value)).toBe(new Date(value).toISOString());
  });

  it.each(["0000-06-12T14:30", "9999-06-12T14:30"])(
    "rejects unsupported local datetime year in %s",
    (value) => {
      expect(() => localDateTimeToUtc(value)).toThrow(
        new RangeError(supportedYearError),
      );
    },
  );

  it("returns local midnight bounds using the next local calendar day", () => {
    const dateValue = "2026-03-08";
    const expectedStart = new Date(2026, 2, 8);
    const expectedEnd = new Date(expectedStart);
    expectedEnd.setDate(expectedEnd.getDate() + 1);

    expect(localDayBoundsUtc(dateValue)).toEqual({
      startUtc: expectedStart.toISOString(),
      endUtc: expectedEnd.toISOString(),
    });
  });

  it.each(["2026-02-30", "2026-6-12", "not-a-date"])(
    "rejects invalid date-only value %s",
    (value) => {
      expect(() => allDayDatesToUtc(value, "2026-06-12")).toThrow(
        RangeError,
      );
      expect(() => localDayBoundsUtc(value)).toThrow(RangeError);
    },
  );

  it.each(["0000-01-01", "9999-12-31"])(
    "rejects unsupported date-only year in %s",
    (value) => {
      expect(() => allDayDatesToUtc(value, value)).toThrow(
        new RangeError(supportedYearError),
      );
      expect(() => localDayBoundsUtc(value)).toThrow(
        new RangeError(supportedYearError),
      );
    },
  );

  it.each([
    ["0000-01-01T00:00:00Z", "0001-01-01T00:00:00Z"],
    ["9999-01-01T00:00:00Z", "9999-01-02T00:00:00Z"],
  ])(
    "rejects UTC all-day ranges that would return unsupported dates %#",
    (startUtc, exclusiveEndUtc) => {
      expect(() =>
        utcAllDayToDates(startUtc, exclusiveEndUtc),
      ).toThrow(new RangeError(supportedYearError));
    },
  );

  it.each(["not-a-date", "2026-02-30T12:00"])(
    "rejects invalid datetime value %s",
    (value) => {
      expect(() => toLocalDateTimeInput(value)).toThrow(RangeError);
      expect(() => localDateTimeToUtc(value)).toThrow(RangeError);
      expect(() =>
        utcAllDayToDates(value, "2026-06-13T00:00:00.000Z"),
      ).toThrow(RangeError);
    },
  );
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar, PlannerUser } from "./contracts";
import { createPlannerApi } from "./plannerApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
  });
}

const firstCalendar: PlannerCalendar = {
  calendarId: "calendar-1",
  ownerUserId: "owner-1",
  name: "Work",
  description: null,
  colorHex: "#3366ff",
};

const secondCalendar: PlannerCalendar = {
  calendarId: "calendar-2",
  ownerUserId: "owner-1",
  name: "Personal",
  description: null,
  colorHex: "#ff6633",
};

const plannerUser: PlannerUser = {
  userId: "user/id +?",
  email: "ada@example.test",
  normalizedEmail: "ADA@EXAMPLE.TEST",
  displayName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  timeZoneId: "America/New_York",
  isActive: true,
  createdUtc: "2026-01-02T03:04:05Z",
  updatedUtc: "2026-06-13T12:00:00Z",
  deletedUtc: null,
  rowVersion: "row-version-1",
};

describe("createPlannerApi user transport", () => {
  it("gets a user from an encoded path with JSON request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(plannerUser));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPlannerApi("https://api.example.test").getUser(
        plannerUser.userId,
      ),
    ).resolves.toEqual(plannerUser);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.test/api/Users/${encodeURIComponent(plannerUser.userId)}`,
    );
    expect(init.method).toBeUndefined();
    expect(new Headers(init.headers).get("accept")).toBe(
      "application/json",
    );
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("updates an encoded user path with PUT and the complete JSON body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await createPlannerApi("https://api.example.test").updateUser(
      plannerUser.userId,
      plannerUser,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.test/api/Users/${encodeURIComponent(plannerUser.userId)}`,
    );
    expect(init).toMatchObject({
      method: "PUT",
      body: JSON.stringify(plannerUser),
    });
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
  });
});

describe("createPlannerApi pagination", () => {
  it("aggregates multiple calendar pages and increments the page number", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [firstCalendar],
          totalCount: 2,
          page: 1,
          pageSize: 200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [secondCalendar],
          totalCount: 2,
          page: 2,
          pageSize: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPlannerApi("https://api.example.test").getCalendars("owner-1"),
    ).resolves.toEqual([firstCalendar, secondCalendar]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/api/Calendars?ownerUserId=owner-1&page=1&pageSize=200",
      "https://api.example.test/api/Calendars?ownerUserId=owner-1&page=2&pageSize=200",
    ]);
  });

  it("encodes event owner and date values and uses page size 500", async () => {
    const ownerUserId = "owner/id +?";
    const startUtc = "2026-06-12T09:00:00-04:00";
    const endUtc = "2026-06-12T10:00:00-04:00#end";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 500,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createPlannerApi("https://api.example.test").getEvents(
      ownerUserId,
      startUtc,
      endUtc,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test/api/Events?ownerUserId=${encodeURIComponent(ownerUserId)}&startUtc=${encodeURIComponent(startUtc)}&endUtc=${encodeURIComponent(endUtc)}&page=1&pageSize=500`,
      expect.any(Object),
    );
  });

  it("rejects an empty page before requesting another page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [firstCalendar],
          totalCount: 2,
          page: 1,
          pageSize: 200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [],
          totalCount: 2,
          page: 2,
          pageSize: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPlannerApi("https://api.example.test").getCalendars("owner-1"),
    ).rejects.toThrow(
      "Pagination made no forward progress before reaching totalCount.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects response metadata that repeats the previous page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [firstCalendar],
          totalCount: 3,
          page: 1,
          pageSize: 200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [firstCalendar],
          totalCount: 3,
          page: 1,
          pageSize: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPlannerApi("https://api.example.test").getCalendars("owner-1"),
    ).rejects.toThrow("Malformed paginated response.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects response metadata with a mismatched page size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [],
          totalCount: 0,
          page: 1,
          pageSize: 50,
        }),
      ),
    );

    await expect(
      createPlannerApi("https://api.example.test").getCalendars("owner-1"),
    ).rejects.toThrow("Malformed paginated response.");
  });

  it.each([
    {
      items: {},
      totalCount: 0,
      page: 1,
      pageSize: 200,
    },
    {
      items: [],
      totalCount: -1,
      page: 1,
      pageSize: 200,
    },
    {
      items: [],
      totalCount: 1.5,
      page: 1,
      pageSize: 200,
    },
    {
      items: [],
      totalCount: 0,
      page: 0,
      pageSize: 200,
    },
    {
      items: [],
      totalCount: 0,
      page: 1.5,
      pageSize: 200,
    },
    {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 0,
    },
    {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 1.5,
    },
  ])("rejects malformed pagination %#", async (payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    await expect(
      createPlannerApi("https://api.example.test").getCalendars("owner-1"),
    ).rejects.toThrow("Malformed paginated response.");
  });
});

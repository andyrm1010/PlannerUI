import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./http";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends accept JSON and merges caller headers without adding content-type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await request("http://api.test/events", {
      headers: new Headers({ "x-request-id": "request-123" }),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("request-123");
    expect(headers.has("content-type")).toBe(false);
  });

  it("adds JSON content-type when a body is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await request("http://api.test/events", {
      method: "POST",
      body: JSON.stringify({ title: "Planning" }),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("returns undefined for a 204 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(request("http://api.test/events/1")).resolves.toBeUndefined();
  });

  it("parses JSON for a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ eventId: "event-123" })),
        ),
    );

    await expect(
      request<{ eventId: string }>("http://api.test/events/1"),
    ).resolves.toEqual({ eventId: "event-123" });
  });

  it("normalizes a 429 problem response and retry-after exactly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Too many requests",
            detail: "Try again later.",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/problem+json",
              "retry-after": "12",
            },
          },
        ),
      ),
    );

    await expect(request("http://api.test/events")).rejects.toEqual(
      new ApiError(429, "Too many requests", "Try again later.", 12),
    );
  });

  it("falls back to the status message for a null JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("null", {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );

    await expect(request("http://api.test/events")).rejects.toEqual(
      new ApiError(500, "Request failed with status 500."),
    );
  });

  it("parses an HTTP-date retry-after using the current system time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00.250Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Service unavailable" }), {
          status: 503,
          headers: {
            "retry-after": "Fri, 12 Jun 2026 12:00:02 GMT",
          },
        }),
      ),
    );

    await expect(request("http://api.test/events")).rejects.toEqual(
      new ApiError(503, "Service unavailable", undefined, 2),
    );
  });

  it("clamps a past HTTP-date retry-after to zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Service unavailable" }), {
          status: 503,
          headers: {
            "retry-after": "Fri, 12 Jun 2026 11:59:59 GMT",
          },
        }),
      ),
    );

    await expect(request("http://api.test/events")).rejects.toEqual(
      new ApiError(503, "Service unavailable", undefined, 0),
    );
  });

  it.each(["1.5", "1e3", "0x10", "-1", "not-a-retry-value"])(
    "ignores invalid retry-after value %s",
    async (retryAfter) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ title: "Service unavailable" }), {
            status: 503,
            headers: {
              "retry-after": retryAfter,
            },
          }),
        ),
      );

      await expect(request("http://api.test/events")).rejects.toEqual(
        new ApiError(503, "Service unavailable"),
      );
    },
  );
});

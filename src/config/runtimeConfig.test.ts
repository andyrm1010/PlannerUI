import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtimeConfig";

describe("parseRuntimeConfig", () => {
  const validUserId = "7c59e1be-9a3a-40e3-8d72-641aed86b170";
  const invalidUrlError =
    "VITE_API_BASE_URL must be an absolute HTTP(S) URL without a query or fragment.";

  it("trims and normalizes a valid HTTP(S) base URL", () => {
    expect(
      parseRuntimeConfig({
        VITE_API_BASE_URL: "https://localhost:44318",
        VITE_DEMO_USER_ID: validUserId,
      }),
    ).toEqual({
      apiBaseUrl: "https://api.example.test/planner",
      demoUserId: validUserId,
    });
  });

  it("returns setup errors for missing values", () => {
    expect(parseRuntimeConfig({})).toEqual({
      errors: [
        "VITE_API_BASE_URL is required.",
        "VITE_DEMO_USER_ID must be a valid UUID.",
      ],
    });
  });

  it.each([
    "api.example.test",
    "/api",
    "ftp://api.example.test",
    "https://api.example.test?tenant=demo",
    "https://api.example.test#calendar",
  ])("rejects invalid API base URL %s", (apiBaseUrl) => {
    expect(
      parseRuntimeConfig({
        VITE_API_BASE_URL: apiBaseUrl,
        VITE_DEMO_USER_ID: validUserId,
      }),
    ).toEqual({
      errors: [invalidUrlError],
    });
  });
});

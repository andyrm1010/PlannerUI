export type RuntimeConfig = {
  apiBaseUrl: string;
  demoUserId: string;
};

export type RuntimeConfigResult = RuntimeConfig | { errors: string[] };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalidApiBaseUrlError =
  "VITE_API_BASE_URL must be an absolute HTTP(S) URL without a query or fragment.";

function normalizeApiBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const hasQueryOrFragment = value.includes("?") || value.includes("#");

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      hasQueryOrFragment
    ) {
      return undefined;
    }

    return value.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
): RuntimeConfigResult {
  const errors: string[] = [];
  const rawApiBaseUrl = env.VITE_API_BASE_URL?.trim() ?? "https://localhost:44318";
  const apiBaseUrl = rawApiBaseUrl
    ? normalizeApiBaseUrl(rawApiBaseUrl)
    : undefined;
  const demoUserId = env.VITE_DEMO_USER_ID ?? "6c3d98d4-8b88-42e8-b8d1-4d3d17b04af1";

  if (!rawApiBaseUrl) {
    errors.push("VITE_API_BASE_URL is required.");
  } else if (!apiBaseUrl) {
    errors.push(invalidApiBaseUrlError);
  }

  if (!uuidPattern.test(demoUserId)) {
    errors.push("VITE_DEMO_USER_ID must be a valid UUID.");
  }

  return errors.length > 0
    ? { errors }
    : { apiBaseUrl: apiBaseUrl!, demoUserId };
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);

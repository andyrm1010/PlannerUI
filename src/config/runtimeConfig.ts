export type RuntimeConfig = {
  apiBaseUrl: string;
  demoUserId: string;
};

export type RuntimeConfigResult =
  | RuntimeConfig
  | { errors: string[]; demoUserIdMissing?: boolean }
  | { errors: string[] };

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
  let apiBaseUrl: string | undefined;

  try {
    const rawApiBaseUrl = env.VITE_API_BASE_URL?.trim();
    if (rawApiBaseUrl) {
      const normalized = normalizeApiBaseUrl(rawApiBaseUrl);
      if (normalized) {
        apiBaseUrl = normalized;
      } else {
        errors.push(invalidApiBaseUrlError);
      }
    } else {
      const defaultBaseUrl = "http://localhost:51272";
      apiBaseUrl = defaultBaseUrl;
    }
  } catch (error) {
    errors.push("Invalid VITE_API_BASE_URL configuration.");
  }

  // Step 1: Check localStorage for persisted user ID (if available from previous session)
  let demoUserId = '';
  let isSessionUser: boolean | undefined;

  try {
    const storedUserId = localStorage.getItem("planner_user_id");
    if (storedUserId && uuidPattern.test(storedUserId)) {
      // User has been created and persisted - use this ID
      demoUserId = storedUserId;
      isSessionUser = true;
    }
  } catch {
    // localStorage not available, skip persistence
  }

  // Step 2: If no persisted user, check environment variable
  if (!isSessionUser && env.VITE_DEMO_USER_ID) {
    const trimmedDemoUserId = env.VITE_DEMO_USER_ID.trim();
    if (!uuidPattern.test(trimmedDemoUserId)) {
      errors.push("VITE_DEMO_USER_ID must be a valid UUID.");
    } else {
      demoUserId = trimmedDemoUserId;
      isSessionUser = false;
    }
  }

  // Step 3: If still no user ID, assume user needs to create themselves
  let demoUserIdMissing = false;

  if (!demoUserId) {
    demoUserIdMissing = true;
  }

  if (errors.length > 0) {
    return { errors };
  }

  // Check if this is a new user (no existing user ID from localStorage or env)
  if (!demoUserId && apiBaseUrl !== undefined) {
    return { apiBaseUrl, demoUserId: "", demoUserIdMissing: true };
  }

  // At this point, we must have apiBaseUrl defined (or there would be errors)
  // and we have a valid demoUserId, so return the configured RuntimeConfig
  if (apiBaseUrl !== undefined) {
    return { apiBaseUrl, demoUserId };
  }

  // Fallback: shouldn't reach here given validation above, but handle gracefully
  return { errors: ["Unexpected configuration state"] };
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);

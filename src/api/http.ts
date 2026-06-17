export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ProblemDetails = {
  title?: string;
  detail?: string;
};

function toProblemDetails(value: unknown): ProblemDetails {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    title: typeof record.title === "string" ? record.title : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  if (/^\d+$/.test(normalizedValue)) {
    const seconds = Number(normalizedValue);
    return Number.isFinite(seconds) ? seconds : undefined;
  }

  if (/^[+-]?(?:\d|\.\d)/.test(normalizedValue)) {
    return undefined;
  }

  const retryAt = Date.parse(normalizedValue);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

export async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const problem = toProblemDetails(
      await response.json().catch(() => undefined),
    );
    throw new ApiError(
      response.status,
      problem.title ?? `Request failed with status ${response.status}.`,
      problem.detail,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

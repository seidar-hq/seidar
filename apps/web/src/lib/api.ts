const API_URL =
  process.env.NEXT_PUBLIC_SEIDAR_API_URL ?? "http://localhost:8080";

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  email_verified_at: string | null;
  created_at: string;
};

type APIErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class APIError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let body: APIErrorBody = {};
    try {
      body = (await response.json()) as APIErrorBody;
    } catch {
      // The fallback below also covers non-JSON upstream failures.
    }
    throw new APIError(
      response.status,
      body.error?.code ?? "request_failed",
      body.error?.message ?? "Something went wrong. Please try again.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function googleSignInURL(next?: string) {
  const url = new URL(`${API_URL}/v1/auth/google/start`);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export function apiURL(path: string) {
  return `${API_URL}${path}`;
}

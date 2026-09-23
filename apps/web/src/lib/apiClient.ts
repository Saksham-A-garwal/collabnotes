import type { ErrorEnvelope } from "@collabnotes/shared";
import { clearSession, loadSession, saveTokens } from "./authStorage.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!res.ok) {
          clearSession();
          return null;
        }
        const body = (await res.json()) as { accessToken: string; refreshToken: string };
        saveTokens(body.accessToken, body.refreshToken);
        return body.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; skipAuthRetry?: boolean } = {},
): Promise<T> {
  const session = loadSession();

  const doFetch = async (accessToken: string | undefined): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(session?.accessToken);

  if (res.status === 401 && !options.skipAuthRetry && session) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      res = await doFetch(newAccessToken);
    }
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    throw new ApiRequestError(
      res.status,
      envelope?.error.code ?? "INTERNAL_ERROR",
      envelope?.error.message ?? "Something went wrong.",
    );
  }

  return res.json() as Promise<T>;
}

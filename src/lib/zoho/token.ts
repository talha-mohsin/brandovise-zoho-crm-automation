import { env } from "@/lib/env";

// Server-only. Never import this file from client components.
// Holds the short-lived Zoho access token in memory for the life of the
// server process and refreshes it using the long-lived refresh token when
// it is close to expiry. The refresh token / client secret never leave the
// server: this module is the only place that talks to accounts.zoho.*.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

const SAFETY_MARGIN_MS = 60_000; // refresh a minute before actual expiry

async function fetchNewAccessToken(): Promise<string> {
  const url = new URL("/oauth/v2/token", env.zohoAccountsUrl);
  url.searchParams.set("refresh_token", env.zohoRefreshToken);
  url.searchParams.set("client_id", env.zohoClientId);
  url.searchParams.set("client_secret", env.zohoClientSecret);
  url.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(url.toString(), { method: "POST" });
  const body = await res.json();

  if (!res.ok || !body.access_token) {
    throw new Error(
      `Zoho token refresh failed: ${res.status} ${JSON.stringify(body)}`
    );
  }

  const expiresInSec = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cached = {
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresInSec * 1000,
  };
  return cached.accessToken;
}

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }
  // Coalesce concurrent refreshes into a single request.
  if (!inFlight) {
    inFlight = fetchNewAccessToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Force the next call to fetch a fresh token, e.g. after a 401 from the API. */
export function invalidateAccessToken() {
  cached = null;
}

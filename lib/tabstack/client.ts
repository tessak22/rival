/**
 * Tabstack SDK client wrapper.
 *
 * What it does:
 * - Provides a singleton Tabstack SDK instance shared across all endpoint modules.
 * - Maps Rival-level effort labels (`low`/`high`) to SDK values (`standard`/`max`).
 * - Normalizes and validates geo-target country codes.
 *
 * Cost tier:
 * - N/A — this module does not make API calls directly.
 *
 * When to use vs alternatives:
 * - Always import `getTabstackClient()` from here instead of constructing `new Tabstack(...)`.
 * - Never use raw `fetch` against Tabstack endpoints.
 *
 * Key parameters:
 * - `TABSTACK_API_KEY` env var (required): authenticates all SDK calls.
 * - Timeout: 120s, maxRetries: 2 (configured once here).
 *
 * Fallback behavior:
 * - No fallback — throws if the API key is missing.
 */
import Tabstack from "@tabstack/sdk";

export type RivalEffort = "low" | "high";
export type SdkEffort = "min" | "standard" | "max";

type TabstackClient = InstanceType<typeof Tabstack>;

const globalForTabstack = globalThis as unknown as {
  tabstackClient?: TabstackClient;
};

export function getTabstackClient(): TabstackClient {
  if (globalForTabstack.tabstackClient) {
    return globalForTabstack.tabstackClient;
  }

  const apiKey = process.env.TABSTACK_API_KEY;

  if (!apiKey) {
    throw new Error("TABSTACK_API_KEY is required to initialize Tabstack client");
  }

  const client = new Tabstack({
    apiKey,
    timeout: 120_000,
    maxRetries: 2
  });

  globalForTabstack.tabstackClient = client;

  return client;
}

/**
 * Rival-level effort labels are explicit in scanner and logs (`low`/`high`).
 * The Tabstack SDK currently uses `min`/`standard`/`max`, so we map here.
 */
export function toSdkEffort(effort: RivalEffort): SdkEffort {
  switch (effort) {
    case "high":
      return "max";
    case "low":
      return "standard";
    default: {
      const unreachable: never = effort;
      throw new Error(`Unsupported Rival effort value: ${String(unreachable)}`);
    }
  }
}

export function toGeoTarget(countryCode?: string | null): { country: string } | undefined {
  if (!countryCode) {
    return undefined;
  }

  const normalized = countryCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized)) {
    return undefined;
  }

  return { country: normalized };
}

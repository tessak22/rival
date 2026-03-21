import Tabstack from "@tabstack/sdk";

export type RivalEffort = "low" | "high";
export type SdkEffort = "min" | "standard" | "max";

type TabstackClient = InstanceType<typeof Tabstack>;

const globalForTabstack = globalThis as unknown as {
  tabstackClient?: TabstackClient;
};

/**
 * Shared Tabstack SDK client for the entire app.
 *
 * Centralizing this client enforces one integration path across all endpoint modules,
 * keeps auth/config in a single place, and prevents accidental raw fetch usage.
 */
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
export function toSdkEffort(effort: RivalEffort): "standard" | "max" {
  return effort === "high" ? "max" : "standard";
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tabstackCtorMock } = vi.hoisted(() => ({
  tabstackCtorMock: vi.fn((options: unknown) => ({ options }))
}));

vi.mock("@tabstack/sdk", () => ({
  default: tabstackCtorMock
}));

describe("tabstack client wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    tabstackCtorMock.mockClear();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "tabstackClient");
    delete process.env.TABSTACK_API_KEY;
  });

  it("throws when TABSTACK_API_KEY is missing", async () => {
    const { getTabstackClient } = await import("@/lib/tabstack/client");
    expect(() => getTabstackClient()).toThrow("TABSTACK_API_KEY is required");
  });

  it("returns a cached singleton client", async () => {
    process.env.TABSTACK_API_KEY = "test-key";
    const { getTabstackClient } = await import("@/lib/tabstack/client");

    const first = getTabstackClient();
    const second = getTabstackClient();

    expect(first).toBe(second);
    expect(tabstackCtorMock).toHaveBeenCalledTimes(1);
    expect(tabstackCtorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 120_000,
      maxRetries: 2
    });
  });

  it("reuses globally cached client when present", async () => {
    const existing = { extract: {} };
    (globalThis as Record<string, unknown>).tabstackClient = existing;

    const { getTabstackClient } = await import("@/lib/tabstack/client");
    const result = getTabstackClient();

    expect(result).toBe(existing);
    expect(tabstackCtorMock).not.toHaveBeenCalled();
  });

  it("maps Rival effort values to SDK effort", async () => {
    const { toSdkEffort } = await import("@/lib/tabstack/client");

    expect(toSdkEffort("low")).toBe("standard");
    expect(toSdkEffort("high")).toBe("max");
  });

  it("normalizes and validates geo target country", async () => {
    const { toGeoTarget } = await import("@/lib/tabstack/client");

    expect(toGeoTarget(" us ")).toEqual({ country: "US" });
    expect(toGeoTarget("USA")).toBeUndefined();
    expect(toGeoTarget("1A")).toBeUndefined();
    expect(toGeoTarget("")).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { jsonMock, loggerCallMock, getTabstackClientMock, toGeoTargetMock, toSdkEffortMock } =
  vi.hoisted(() => ({
    jsonMock: vi.fn(),
    loggerCallMock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    getTabstackClientMock: vi.fn(),
    toGeoTargetMock: vi.fn(),
    toSdkEffortMock: vi.fn()
  }));

vi.mock("@/lib/logger", () => ({
  logger: {
    call: loggerCallMock
  }
}));

vi.mock("@/lib/tabstack/client", () => ({
  getTabstackClient: getTabstackClientMock,
  toGeoTarget: toGeoTargetMock,
  toSdkEffort: toSdkEffortMock
}));

describe("extractJson", () => {
  beforeEach(() => {
    vi.resetModules();
    jsonMock.mockReset();
    loggerCallMock.mockClear();
    getTabstackClientMock.mockReturnValue({ extract: { json: jsonMock } });
    toGeoTargetMock.mockReturnValue({ country: "GB" });
    toSdkEffortMock.mockReturnValue("max");
    jsonMock.mockResolvedValue({ tiers: [] });
  });

  it("builds json extraction payload and logs required-derived fields", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await extractJson({
      url: "https://example.com/pricing",
      jsonSchema: {
        type: "object",
        required: ["tiers", "has_free_tier"],
        properties: { tiers: { type: "array" } }
      },
      effort: "high",
      nocache: true,
      geoTarget: "gb"
    });

    expect(jsonMock).toHaveBeenCalledWith({
      url: "https://example.com/pricing",
      json_schema: {
        type: "object",
        required: ["tiers", "has_free_tier"],
        properties: { tiers: { type: "array" } }
      },
      effort: "max",
      nocache: true,
      geo_target: { country: "GB" }
    });

    expect(loggerCallMock).toHaveBeenCalledWith(expect.any(Function),
      expect.objectContaining({ endpoint: "extract/json", expectedFields: ["tiers", "has_free_tier"] })
    );
  });

  it("falls back to top-level properties when required is absent", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await extractJson({
      url: "https://example.com/careers",
      jsonSchema: {
        type: "object",
        properties: { open_roles: { type: "array" }, total_count: { type: "number" } }
      },
      effort: "low",
      nocache: false
    });

    expect(loggerCallMock).toHaveBeenLastCalledWith(expect.any(Function),
      expect.objectContaining({ expectedFields: ["open_roles", "total_count"] })
    );
  });

  it("uses explicit expectedFields override when provided", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await extractJson({
      url: "https://example.com/custom",
      jsonSchema: { type: "object", properties: { ignored: { type: "string" } } },
      expectedFields: ["forced_field"],
      effort: "low",
      nocache: true
    });

    expect(loggerCallMock).toHaveBeenLastCalledWith(expect.any(Function),
      expect.objectContaining({ expectedFields: ["forced_field"] })
    );
  });

  it("throws for invalid schema.properties shape", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await expect(
      extractJson({
        url: "https://example.com",
        jsonSchema: { type: "object", properties: [] as unknown as Record<string, unknown> },
        effort: "low",
        nocache: true
      })
    ).rejects.toThrow("jsonSchema.properties must be an object");
  });

  it("throws for invalid schema.required shape", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await expect(
      extractJson({
        url: "https://example.com",
        jsonSchema: { type: "object", required: [1] as unknown as string[] },
        effort: "low",
        nocache: true
      })
    ).rejects.toThrow("jsonSchema.required must be an array of strings");
  });

  it("passes isDemo flag through to logger metadata", async () => {
    const { extractJson } = await import("@/lib/tabstack/extract-json");

    await extractJson({
      url: "https://example.com/demo",
      jsonSchema: { type: "object", properties: { name: { type: "string" } } },
      effort: "low",
      nocache: false,
      isDemo: true
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isDemo: true })
    );
  });
});

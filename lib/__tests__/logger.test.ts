import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiLogCreateMock, emitWarningMock } = vi.hoisted(() => ({
  apiLogCreateMock: vi.fn(),
  emitWarningMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    apiLog: {
      create: apiLogCreateMock
    }
  }
}));

describe("logger.call", () => {
  beforeEach(() => {
    apiLogCreateMock.mockReset();
    apiLogCreateMock.mockResolvedValue({});
    emitWarningMock.mockReset();
    vi.spyOn(process, "emitWarning").mockImplementation(emitWarningMock as typeof process.emitWarning);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs success with full quality when all expected fields exist", async () => {
    const { logger } = await import("@/lib/logger");

    const result = await logger.call(
      () => Promise.resolve({ data: { content: "hello", url: "https://x.test" } }),
      {
        endpoint: "extract/markdown",
        expectedFields: ["content", "url"],
        nocache: true
      }
    );

    expect(result).toEqual({ data: { content: "hello", url: "https://x.test" } });
    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          resultQuality: "full",
          missingFields: [],
          nocache: true
        })
      })
    );
  });

  it("logs empty quality when payload has no expected content", async () => {
    const { logger } = await import("@/lib/logger");

    await logger.call(
      () => Promise.resolve({ data: {} }),
      {
        endpoint: "extract/json",
        expectedFields: ["tiers", "pricing_transparent"]
      }
    );

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "empty",
          resultQuality: "empty",
          missingFields: ["tiers", "pricing_transparent"],
          schemaMismatch: false
        })
      })
    );
  });

  it("logs partial quality and missing fields", async () => {
    const { logger } = await import("@/lib/logger");

    await logger.call(
      () => Promise.resolve({ data: { tiers: ["starter"] } }),
      {
        endpoint: "extract/json",
        expectedFields: ["tiers", "has_free_tier"]
      }
    );

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          resultQuality: "partial",
          missingFields: ["has_free_tier"]
        })
      })
    );
  });

  it("marks fallback status when fallback is triggered", async () => {
    const { logger } = await import("@/lib/logger");

    await logger.call(
      () => Promise.resolve({ data: { content: "x", url: "https://x.test" } }),
      {
        endpoint: "extract/markdown",
        expectedFields: ["content", "url"],
        fallback: { triggered: true, reason: "empty result", endpoint: "automate" }
      }
    );

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "fallback",
          fallbackTriggered: true,
          fallbackReason: "empty result",
          fallbackEndpoint: "automate"
        })
      })
    );
  });

  it("logs and rethrows errors from wrapped call", async () => {
    const { logger } = await import("@/lib/logger");

    await expect(
      logger.call(
        () => Promise.reject(new Error("network down")),
        { endpoint: "generate", expectedFields: ["summary"] }
      )
    ).rejects.toThrow("network down");

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "error",
          resultQuality: "empty",
          rawError: expect.stringContaining("network down")
        })
      })
    );
  });

  it("does not fail wrapped call when log persistence fails", async () => {
    const { logger } = await import("@/lib/logger");
    apiLogCreateMock.mockRejectedValueOnce(new Error("db unavailable"));

    const result = await logger.call(
      () => Promise.resolve({ data: { content: "ok", url: "https://x.test" } }),
      { endpoint: "extract/markdown", expectedFields: ["content", "url"] }
    );

    expect(result).toEqual({ data: { content: "ok", url: "https://x.test" } });
    expect(emitWarningMock).toHaveBeenCalled();
  });

  it("detects not-found and blocked signals from message text fields", async () => {
    const { logger } = await import("@/lib/logger");

    await logger.call(
      () => Promise.resolve({ message: "404 not found - access denied" }),
      { endpoint: "extract/markdown" }
    );

    expect(apiLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageNotFound: true,
          contentBlocked: true
        })
      })
    );
  });
});

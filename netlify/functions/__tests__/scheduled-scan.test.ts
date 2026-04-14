import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../scheduled-scan";

describe("scheduled-scan", () => {
  beforeEach(() => {
    vi.stubEnv("URL", "https://rival.netlify.app");
    vi.stubEnv("CRON_SECRET", "test-secret");
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POSTs to /api/cron with x-cron-secret header", async () => {
    await handler();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rival.netlify.app/api/cron",
      {
        method: "POST",
        headers: { "x-cron-secret": "test-secret" }
      }
    );
  });

  it("throws when /api/cron returns a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(handler()).rejects.toThrow("/api/cron responded 401");
  });

  it("exports the correct cron schedule", async () => {
    const { config } = await import("../scheduled-scan");
    expect(config.schedule).toBe("0 6 * * *");
  });
});

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
});

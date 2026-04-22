import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { config } from "../scheduled-scan-background";

vi.mock("../../../lib/run-scans", () => ({
  runScans: vi.fn().mockResolvedValue({ competitors: 7, staleLocksDeleted: 0, summary: [] })
}));

import { runScans } from "../../../lib/run-scans";

describe("scheduled-scan-background", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls runScans directly", async () => {
    await handler();
    expect(runScans).toHaveBeenCalledOnce();
  });

  it("throws when runScans rejects", async () => {
    vi.mocked(runScans).mockRejectedValueOnce(new Error("db down"));
    await expect(handler()).rejects.toThrow("db down");
  });

  it("exports the correct cron schedule", () => {
    expect(config.schedule).toBe("0 6 * * *");
  });
});

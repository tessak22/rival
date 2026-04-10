import { beforeEach, describe, expect, it, vi } from "vitest";

const { scanFindFirstMock, scanFindManyMock } = vi.hoisted(() => ({
  scanFindFirstMock: vi.fn(),
  scanFindManyMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scan: {
      findFirst: scanFindFirstMock,
      findMany: scanFindManyMock
    }
  }
}));

const PAGE = { id: "page_1", competitorId: "cmp_1", label: "Pricing", url: "https://example.com/pricing", type: "pricing" };
const SCAN = { id: "scan_1", pageId: "page_1", scannedAt: new Date("2026-04-01T00:00:00Z"), hasChanges: false, page: PAGE };
const SCAN_WITH_CHANGES = { ...SCAN, id: "scan_2", hasChanges: true };

describe("lib/db/scans", () => {
  beforeEach(() => {
    scanFindFirstMock.mockReset();
    scanFindManyMock.mockReset();
    scanFindFirstMock.mockResolvedValue(SCAN);
    scanFindManyMock.mockResolvedValue([SCAN]);
  });

  describe("getLatestScanForPage", () => {
    it("returns the most recent scan for the given page", async () => {
      const { getLatestScanForPage } = await import("@/lib/db/scans");
      const result = await getLatestScanForPage("page_1");
      expect(scanFindFirstMock).toHaveBeenCalledWith({
        where: { pageId: "page_1" },
        orderBy: { scannedAt: "desc" }
      });
      expect(result).toEqual(SCAN);
    });

    it("returns null when no scans exist for the page", async () => {
      scanFindFirstMock.mockResolvedValueOnce(null);
      const { getLatestScanForPage } = await import("@/lib/db/scans");
      const result = await getLatestScanForPage("page_unknown");
      expect(result).toBeNull();
    });
  });

  describe("listRecentScansForCompetitor", () => {
    it("returns scans for competitor's pages ordered by scannedAt desc", async () => {
      const { listRecentScansForCompetitor } = await import("@/lib/db/scans");
      const result = await listRecentScansForCompetitor("cmp_1");
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { page: { competitorId: "cmp_1" } },
          include: { page: true },
          orderBy: { scannedAt: "desc" }
        })
      );
      expect(result).toEqual([SCAN]);
    });

    it("defaults to limit 50", async () => {
      const { listRecentScansForCompetitor } = await import("@/lib/db/scans");
      await listRecentScansForCompetitor("cmp_1");
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });

    it("respects a custom limit", async () => {
      const { listRecentScansForCompetitor } = await import("@/lib/db/scans");
      await listRecentScansForCompetitor("cmp_1", 10);
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe("listScansWithChanges", () => {
    it("filters to scans with hasChanges: true", async () => {
      scanFindManyMock.mockResolvedValueOnce([SCAN_WITH_CHANGES]);
      const { listScansWithChanges } = await import("@/lib/db/scans");
      const result = await listScansWithChanges("cmp_1");
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hasChanges: true, page: { competitorId: "cmp_1" } }
        })
      );
      expect(result).toEqual([SCAN_WITH_CHANGES]);
    });

    it("defaults to limit 25", async () => {
      const { listScansWithChanges } = await import("@/lib/db/scans");
      await listScansWithChanges("cmp_1");
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      );
    });

    it("respects a custom limit", async () => {
      const { listScansWithChanges } = await import("@/lib/db/scans");
      await listScansWithChanges("cmp_1", 5);
      expect(scanFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });
});

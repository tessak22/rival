import { beforeEach, describe, expect, it, vi } from "vitest";

const { deepDiveCreateMock, deepDiveFindManyMock } = vi.hoisted(() => ({
  deepDiveCreateMock: vi.fn(),
  deepDiveFindManyMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    deepDive: {
      create: deepDiveCreateMock,
      findMany: deepDiveFindManyMock
    }
  }
}));

const DEEP_DIVE = {
  id: "dd_1",
  competitorId: "cmp_1",
  mode: "balanced",
  query: "Research Acme",
  result: { summary: "..." },
  citations: ["https://example.com"],
  createdAt: new Date("2026-04-01T00:00:00Z")
};

describe("lib/db/deep-dives", () => {
  beforeEach(() => {
    deepDiveCreateMock.mockReset();
    deepDiveFindManyMock.mockReset();
    deepDiveCreateMock.mockResolvedValue(DEEP_DIVE);
    deepDiveFindManyMock.mockResolvedValue([DEEP_DIVE]);
  });

  describe("createDeepDive", () => {
    it("creates a deep dive with provided result and citations", async () => {
      const { createDeepDive } = await import("@/lib/db/deep-dives");
      const result = await createDeepDive({
        competitorId: "cmp_1",
        mode: "balanced",
        query: "Research Acme",
        result: { summary: "..." },
        citations: ["https://example.com"]
      });
      expect(deepDiveCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            competitorId: "cmp_1",
            mode: "balanced",
            query: "Research Acme"
          })
        })
      );
      expect(result).toEqual(DEEP_DIVE);
    });

    it("defaults result and citations to JsonNull when not provided", async () => {
      const { createDeepDive } = await import("@/lib/db/deep-dives");
      const { Prisma } = await import("@prisma/client");
      await createDeepDive({
        competitorId: "cmp_1",
        mode: "fast",
        query: "Research Acme"
      });
      expect(deepDiveCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: Prisma.JsonNull,
            citations: Prisma.JsonNull
          })
        })
      );
    });
  });

  describe("listDeepDivesForCompetitor", () => {
    it("returns deep dives ordered by createdAt desc", async () => {
      const { listDeepDivesForCompetitor } = await import("@/lib/db/deep-dives");
      const result = await listDeepDivesForCompetitor("cmp_1");
      expect(deepDiveFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { competitorId: "cmp_1" },
          orderBy: { createdAt: "desc" }
        })
      );
      expect(result).toEqual([DEEP_DIVE]);
    });

    it("uses default limit of 20", async () => {
      const { listDeepDivesForCompetitor } = await import("@/lib/db/deep-dives");
      await listDeepDivesForCompetitor("cmp_1");
      expect(deepDiveFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 })
      );
    });

    it("respects a custom limit", async () => {
      const { listDeepDivesForCompetitor } = await import("@/lib/db/deep-dives");
      await listDeepDivesForCompetitor("cmp_1", 5);
      expect(deepDiveFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });
});

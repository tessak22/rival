import { beforeEach, describe, expect, it, vi } from "vitest";

const { competitorFindManyMock, competitorFindUniqueMock } = vi.hoisted(() => ({
  competitorFindManyMock: vi.fn(),
  competitorFindUniqueMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: {
      findMany: competitorFindManyMock,
      findUnique: competitorFindUniqueMock
    }
  }
}));

const COMPETITOR = { id: "cmp_1", name: "Acme", slug: "acme", pages: [] };

describe("lib/db/competitors", () => {
  beforeEach(() => {
    competitorFindManyMock.mockReset();
    competitorFindUniqueMock.mockReset();
    competitorFindManyMock.mockResolvedValue([COMPETITOR]);
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
  });

  describe("listCompetitors", () => {
    it("returns all competitors ordered by name", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      const result = await listCompetitors();
      expect(competitorFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: "asc" } }));
      expect(result).toEqual([COMPETITOR]);
    });

    it("does not include pages by default", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors();
      expect(competitorFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ include: undefined }));
    });

    it("includes pages when includePages is true", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors({ includePages: true });
      expect(competitorFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ include: { pages: true } }));
    });
  });

  describe("getCompetitorById", () => {
    it("fetches a competitor by id including pages", async () => {
      const { getCompetitorById } = await import("@/lib/db/competitors");
      const result = await getCompetitorById("cmp_1");
      expect(competitorFindUniqueMock).toHaveBeenCalledWith({
        where: { id: "cmp_1" },
        include: { pages: true }
      });
      expect(result).toEqual(COMPETITOR);
    });

    it("returns null when competitor is not found", async () => {
      competitorFindUniqueMock.mockResolvedValueOnce(null);
      const { getCompetitorById } = await import("@/lib/db/competitors");
      const result = await getCompetitorById("missing");
      expect(result).toBeNull();
    });
  });

  describe("getCompetitorBySlug", () => {
    it("fetches a competitor by slug including pages", async () => {
      const { getCompetitorBySlug } = await import("@/lib/db/competitors");
      const result = await getCompetitorBySlug("acme");
      expect(competitorFindUniqueMock).toHaveBeenCalledWith({
        where: { slug: "acme" },
        include: { pages: true }
      });
      expect(result).toEqual(COMPETITOR);
    });

    it("returns null when slug is not found", async () => {
      competitorFindUniqueMock.mockResolvedValueOnce(null);
      const { getCompetitorBySlug } = await import("@/lib/db/competitors");
      const result = await getCompetitorBySlug("unknown-slug");
      expect(result).toBeNull();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, findFirstMock, findUniqueMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  findFirstMock: vi.fn(),
  findUniqueMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: {
      findMany: findManyMock,
      findFirst: findFirstMock,
      findUnique: findUniqueMock
    }
  }
}));

const COMPETITOR = { id: "cmp_1", name: "Acme", slug: "acme", pages: [] };

describe("lib/db/competitors", () => {
  beforeEach(() => {
    vi.resetModules();
    findManyMock.mockReset().mockResolvedValue([COMPETITOR]);
    findFirstMock.mockReset().mockResolvedValue(null);
    findUniqueMock.mockReset().mockResolvedValue(COMPETITOR);
  });

  describe("listCompetitors", () => {
    it("returns all competitors ordered by name", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      const result = await listCompetitors();
      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: "asc" } }));
      expect(result).toEqual([COMPETITOR]);
    });

    it("does not include pages by default", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors();
      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ include: undefined }));
    });

    it("includes pages when includePages is true", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors({ includePages: true });
      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ include: { pages: true } }));
    });

    it("excludes self rows by default", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors();
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isSelf: false } })
      );
    });

    it("includes self rows when includeSelf is true", async () => {
      const { listCompetitors } = await import("@/lib/db/competitors");
      await listCompetitors({ includeSelf: true });
      const call = findManyMock.mock.calls[0][0];
      // Either `where` is omitted, or `where` does NOT contain `isSelf: false`:
      expect(call?.where?.isSelf).not.toBe(false);
    });
  });

  describe("getCompetitorById", () => {
    it("fetches a competitor by id including pages", async () => {
      const { getCompetitorById } = await import("@/lib/db/competitors");
      const result = await getCompetitorById("cmp_1");
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: "cmp_1" },
        include: { pages: true }
      });
      expect(result).toEqual(COMPETITOR);
    });

    it("returns null when competitor is not found", async () => {
      findUniqueMock.mockResolvedValueOnce(null);
      const { getCompetitorById } = await import("@/lib/db/competitors");
      const result = await getCompetitorById("missing");
      expect(result).toBeNull();
    });
  });

  describe("getCompetitorBySlug", () => {
    it("fetches a competitor by slug including pages", async () => {
      const { getCompetitorBySlug } = await import("@/lib/db/competitors");
      const result = await getCompetitorBySlug("acme");
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { slug: "acme" },
        include: { pages: true }
      });
      expect(result).toEqual(COMPETITOR);
    });

    it("returns null when slug is not found", async () => {
      findUniqueMock.mockResolvedValueOnce(null);
      const { getCompetitorBySlug } = await import("@/lib/db/competitors");
      const result = await getCompetitorBySlug("unknown-slug");
      expect(result).toBeNull();
    });
  });

  describe("getSelfCompetitor", () => {
    it("queries for the row with isSelf = true including pages", async () => {
      const { getSelfCompetitor } = await import("@/lib/db/competitors");
      await getSelfCompetitor();
      expect(findFirstMock).toHaveBeenCalledWith({
        where: { isSelf: true },
        include: { pages: true }
      });
    });

    it("returns whatever Prisma returns (including null)", async () => {
      findFirstMock.mockResolvedValue(null);
      const { getSelfCompetitor } = await import("@/lib/db/competitors");
      const result = await getSelfCompetitor();
      expect(result).toBeNull();
    });
  });
});

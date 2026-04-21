import { describe, expect, it } from "vitest";
import { parseRivalConfig } from "@/lib/config/rival-config";

describe("parseRivalConfig", () => {
  it("parses config without a self block", () => {
    const result = parseRivalConfig({
      competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
    });
    expect(result.self).toBeNull();
    expect(result.competitors).toHaveLength(1);
  });

  it("parses a self block identically to a competitor entry", () => {
    const result = parseRivalConfig({
      self: {
        name: "Rival",
        slug: "rival",
        url: "https://rival.so",
        pages: [{ label: "Home", url: "https://rival.so", type: "homepage" }]
      },
      competitors: []
    });
    expect(result.self).not.toBeNull();
    expect(result.self?.slug).toBe("rival");
    expect(result.self?.pages).toHaveLength(1);
  });

  it("rejects a self entry whose slug collides with a competitor slug", () => {
    expect(() =>
      parseRivalConfig({
        self: { name: "Rival", slug: "acme", url: "https://rival.so", pages: [] },
        competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
      })
    ).toThrow(/slug.*collision|duplicate slug/i);
  });
});

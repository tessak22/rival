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

describe("parseRivalConfig matrix block", () => {
  it("returns null matrix when config has no matrix block", () => {
    const result = parseRivalConfig({ competitors: [] });
    expect(result.matrix).toBeNull();
  });

  it("parses a valid matrix block", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" }
      }
    });
    expect(result.matrix).not.toBeNull();
    expect(result.matrix?.x_axis.key).toBe("openness_score");
    expect(result.matrix?.y_axis.label_high).toBe("High Trust");
  });

  it("parses optional quadrant_labels when all four are present", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" },
        quadrant_labels: {
          top_left: "Trusted OSS",
          top_right: "Established Leaders",
          bottom_left: "Emerging Players",
          bottom_right: "Niche Specialists"
        }
      }
    });
    expect(result.matrix?.quadrant_labels?.top_right).toBe("Established Leaders");
    expect(result.matrix?.quadrant_labels?.bottom_left).toBe("Emerging Players");
  });

  it("returns null matrix when axis key is not a valid dimension", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "not_a_valid_key", label_low: "Low", label_high: "High" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" }
      }
    });
    expect(result.matrix).toBeNull();
  });
});

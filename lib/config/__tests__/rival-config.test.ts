import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { loadRivalConfig, parseRivalConfig, resolveRivalConfigPath } from "@/lib/config/rival-config";

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

describe("resolveRivalConfigPath", () => {
  const cwd = "/srv/rival";

  it("defaults to rivals.config.json in cwd when RIVAL_CONFIG_PATH is unset", () => {
    expect(resolveRivalConfigPath({}, cwd)).toBe(path.join(cwd, "rivals.config.json"));
  });

  it("treats a blank RIVAL_CONFIG_PATH as unset", () => {
    expect(resolveRivalConfigPath({ RIVAL_CONFIG_PATH: "  " }, cwd)).toBe(path.join(cwd, "rivals.config.json"));
  });

  it("resolves a relative RIVAL_CONFIG_PATH from cwd", () => {
    expect(resolveRivalConfigPath({ RIVAL_CONFIG_PATH: "rivals.config.ichabod.json" }, cwd)).toBe(
      path.join(cwd, "rivals.config.ichabod.json")
    );
  });

  it("keeps an absolute RIVAL_CONFIG_PATH as is", () => {
    expect(resolveRivalConfigPath({ RIVAL_CONFIG_PATH: "/etc/rival/ichabod.json" }, cwd)).toBe(
      "/etc/rival/ichabod.json"
    );
  });
});

describe("loadRivalConfig", () => {
  const original = process.env.RIVAL_CONFIG_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.RIVAL_CONFIG_PATH;
    else process.env.RIVAL_CONFIG_PATH = original;
  });

  it("loads the file RIVAL_CONFIG_PATH names", () => {
    process.env.RIVAL_CONFIG_PATH = "rivals.config.ichabod.json";
    expect(loadRivalConfig().self?.slug).toBe("ichabod");
  });

  it("loads rivals.config.json when RIVAL_CONFIG_PATH is unset", () => {
    delete process.env.RIVAL_CONFIG_PATH;
    expect(loadRivalConfig().self?.slug).toBe("tabstack");
  });
});

describe.each(["rivals.config.json", "rivals.config.tabstack.json", "rivals.config.ichabod.json"])(
  "shipped config %s",
  (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf-8"));
    const parsed = parseRivalConfig(raw);
    const entries = [...(parsed.self ? [parsed.self] : []), ...parsed.competitors];
    const knownTypes = new Set([
      "homepage",
      "pricing",
      "careers",
      "changelog",
      "docs",
      "blog",
      "github",
      "social",
      "profile",
      "stack",
      "reviews",
      "custom"
    ]);

    it("has a valid matrix block", () => {
      expect(parsed.matrix).not.toBeNull();
    });

    it("has unique slugs", () => {
      const slugs = entries.map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("uses only known page types and https URLs", () => {
      for (const entry of entries) {
        expect(entry.url).toMatch(/^https:\/\//);
        for (const page of entry.pages ?? []) {
          expect(knownTypes.has(page.type), `${entry.slug}: ${page.type}`).toBe(true);
          expect(page.url).toMatch(/^https:\/\//);
        }
      }
    });
  }
);

describe("rivals.config.ichabod.json", () => {
  const parsed = parseRivalConfig(
    JSON.parse(fs.readFileSync(path.join(process.cwd(), "rivals.config.ichabod.json"), "utf-8"))
  );

  it("tracks Project Ichabod as self", () => {
    expect(parsed.self?.name).toBe("Project Ichabod");
  });

  it("tracks the named competitors from the Ichabod competitive landscape", () => {
    expect(parsed.competitors.map((c) => c.slug).sort()).toEqual(
      ["browser-use", "browserbase", "browserless", "kernel", "steel"].sort()
    );
  });
});

describe("parseRivalConfig error source", () => {
  it("names the config file it was given in the slug-collision error", () => {
    expect(() =>
      parseRivalConfig(
        {
          self: { name: "Ichabod", slug: "acme", url: "https://i.co", pages: [] },
          competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
        },
        "rivals.config.ichabod.json"
      )
    ).toThrow(/^rivals\.config\.ichabod\.json: slug collision/);
  });
});

describe("loadRivalConfig error source", () => {
  const original = process.env.RIVAL_CONFIG_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.RIVAL_CONFIG_PATH;
    else process.env.RIVAL_CONFIG_PATH = original;
  });

  it("names the RIVAL_CONFIG_PATH file in a slug-collision error", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rival-config-"));
    const file = path.join(dir, "collision.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        self: { name: "X", slug: "acme", url: "https://x.co", pages: [] },
        competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
      })
    );
    process.env.RIVAL_CONFIG_PATH = file;
    try {
      expect(() => loadRivalConfig()).toThrow(`${file}: slug collision`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

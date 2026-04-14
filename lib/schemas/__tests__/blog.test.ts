import { describe, expect, it } from "vitest";

import { BLOG_EXPECTED_FIELDS, BLOG_SCHEMA } from "@/lib/schemas";

describe("blog schema structure", () => {
  it("is a valid JSON schema object", () => {
    expect(BLOG_SCHEMA.type).toBe("object");
    expect(BLOG_SCHEMA.properties).toBeDefined();
    expect(Object.keys(BLOG_SCHEMA.properties).length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 8 properties", () => {
    expect(Object.keys(BLOG_SCHEMA.properties).length).toBe(8);
  });

  it("has a required array with at least one entry", () => {
    expect(BLOG_SCHEMA.required).toBeDefined();
    expect(BLOG_SCHEMA.required.length).toBeGreaterThan(0);
  });

  it("all required fields are defined in properties", () => {
    for (const field of BLOG_SCHEMA.required) {
      expect(Object.keys(BLOG_SCHEMA.properties)).toContain(field);
    }
  });
});

describe("blog EXPECTED_FIELDS", () => {
  it("is non-empty", () => {
    expect(BLOG_EXPECTED_FIELDS.length).toBeGreaterThan(0);
  });

  it("references real schema properties", () => {
    for (const field of BLOG_EXPECTED_FIELDS) {
      expect(typeof field).toBe("string");
      expect(Object.keys(BLOG_SCHEMA.properties)).toContain(field);
    }
  });

  it("matches required fields exactly", () => {
    expect([...BLOG_EXPECTED_FIELDS].sort()).toEqual([...BLOG_SCHEMA.required].sort());
  });
});

describe("blog schema content", () => {
  it("includes recent_post_titles as an array field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("recent_post_titles");
    expect(BLOG_SCHEMA.properties.recent_post_titles.type).toBe("array");
  });

  it("includes recent_post_urls as an array field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("recent_post_urls");
    expect(BLOG_SCHEMA.properties.recent_post_urls.type).toBe("array");
  });

  it("includes recent_post_dates as an array field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("recent_post_dates");
    expect(BLOG_SCHEMA.properties.recent_post_dates.type).toBe("array");
  });

  it("includes post_frequency as a string field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("post_frequency");
    expect(BLOG_SCHEMA.properties.post_frequency.type).toBe("string");
  });

  it("includes primary_topics as an array field (highest-signal for GTM)", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("primary_topics");
    expect(BLOG_SCHEMA.properties.primary_topics.type).toBe("array");
  });

  it("includes developer_focused as a boolean field (highest-signal for GTM)", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("developer_focused");
    expect(BLOG_SCHEMA.properties.developer_focused.type).toBe("boolean");
  });

  it("includes has_categories_or_tags as a boolean field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("has_categories_or_tags");
    expect(BLOG_SCHEMA.properties.has_categories_or_tags.type).toBe("boolean");
  });

  it("includes visible_categories as an array field", () => {
    expect(BLOG_SCHEMA.properties).toHaveProperty("visible_categories");
    expect(BLOG_SCHEMA.properties.visible_categories.type).toBe("array");
  });

  it("requires the three highest-signal fields", () => {
    expect(BLOG_SCHEMA.required).toContain("recent_post_titles");
    expect(BLOG_SCHEMA.required).toContain("primary_topics");
    expect(BLOG_SCHEMA.required).toContain("developer_focused");
  });

  it("does not require optional enrichment fields (post_frequency, dates, urls)", () => {
    expect(BLOG_SCHEMA.required).not.toContain("post_frequency");
    expect(BLOG_SCHEMA.required).not.toContain("recent_post_dates");
    expect(BLOG_SCHEMA.required).not.toContain("recent_post_urls");
  });
});

describe("blog index re-export", () => {
  it("exports BLOG_SCHEMA and BLOG_EXPECTED_FIELDS from the schema index", async () => {
    const index = await import("@/lib/schemas");
    expect(index).toHaveProperty("BLOG_SCHEMA");
    expect(index).toHaveProperty("BLOG_EXPECTED_FIELDS");
  });
});

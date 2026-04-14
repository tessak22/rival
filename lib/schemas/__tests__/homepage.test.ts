import { describe, expect, it } from "vitest";

import { HOMEPAGE_EXPECTED_FIELDS, HOMEPAGE_SCHEMA } from "@/lib/schemas";

describe("HOMEPAGE_SCHEMA structure", () => {
  it("is a valid JSON schema object", () => {
    expect(HOMEPAGE_SCHEMA.type).toBe("object");
    expect(HOMEPAGE_SCHEMA.properties).toBeDefined();
    expect(Object.keys(HOMEPAGE_SCHEMA.properties).length).toBeGreaterThanOrEqual(3);
  });

  it("has all 10 required properties", () => {
    const props = Object.keys(HOMEPAGE_SCHEMA.properties);
    expect(props).toContain("primary_tagline");
    expect(props).toContain("sub_tagline");
    expect(props).toContain("primary_cta_text");
    expect(props).toContain("primary_cta_url");
    expect(props).toContain("secondary_cta_text");
    expect(props).toContain("positioning_statement");
    expect(props).toContain("key_differentiators");
    expect(props).toContain("target_audience_stated");
    expect(props).toContain("social_proof_summary");
    expect(props).toContain("nav_primary_items");
  });

  it("key_differentiators is an array of strings", () => {
    const schema = HOMEPAGE_SCHEMA.properties.key_differentiators;
    expect(schema.type).toBe("array");
    expect(schema.items).toEqual({ type: "string" });
  });

  it("nav_primary_items is an array of strings", () => {
    const schema = HOMEPAGE_SCHEMA.properties.nav_primary_items;
    expect(schema.type).toBe("array");
    expect(schema.items).toEqual({ type: "string" });
  });

  it("primary_tagline, sub_tagline, and key_differentiators are string/array types", () => {
    expect(HOMEPAGE_SCHEMA.properties.primary_tagline.type).toBe("string");
    expect(HOMEPAGE_SCHEMA.properties.sub_tagline.type).toBe("string");
    expect(HOMEPAGE_SCHEMA.properties.key_differentiators.type).toBe("array");
  });
});

describe("HOMEPAGE_SCHEMA required fields", () => {
  it("required array is non-empty", () => {
    expect(HOMEPAGE_SCHEMA.required).toBeDefined();
    expect(HOMEPAGE_SCHEMA.required.length).toBeGreaterThan(0);
  });

  it("all required fields exist in properties", () => {
    for (const field of HOMEPAGE_SCHEMA.required) {
      expect(Object.keys(HOMEPAGE_SCHEMA.properties)).toContain(field);
    }
  });

  it("required includes primary_tagline, sub_tagline, key_differentiators", () => {
    expect(HOMEPAGE_SCHEMA.required).toContain("primary_tagline");
    expect(HOMEPAGE_SCHEMA.required).toContain("sub_tagline");
    expect(HOMEPAGE_SCHEMA.required).toContain("key_differentiators");
  });
});

describe("HOMEPAGE_EXPECTED_FIELDS", () => {
  it("is non-empty", () => {
    expect(HOMEPAGE_EXPECTED_FIELDS.length).toBeGreaterThan(0);
  });

  it("all fields reference real schema properties", () => {
    for (const field of HOMEPAGE_EXPECTED_FIELDS) {
      expect(typeof field).toBe("string");
      expect(Object.keys(HOMEPAGE_SCHEMA.properties)).toContain(field);
    }
  });

  it("matches required fields exactly", () => {
    expect([...HOMEPAGE_EXPECTED_FIELDS].sort()).toEqual([...HOMEPAGE_SCHEMA.required].sort());
  });
});

describe("HOMEPAGE_SCHEMA index re-export", () => {
  it("exports HOMEPAGE_SCHEMA and HOMEPAGE_EXPECTED_FIELDS from the index", async () => {
    const index = await import("@/lib/schemas");
    expect(index).toHaveProperty("HOMEPAGE_SCHEMA");
    expect(index).toHaveProperty("HOMEPAGE_EXPECTED_FIELDS");
  });
});

describe("HOMEPAGE_SCHEMA field descriptions", () => {
  it("primary_tagline description mentions H1 or hero", () => {
    expect(HOMEPAGE_SCHEMA.properties.primary_tagline.description.toLowerCase()).toMatch(/h1|hero/);
  });

  it("key_differentiators description mentions tracking changes", () => {
    expect(HOMEPAGE_SCHEMA.properties.key_differentiators.description.toLowerCase()).toMatch(/track|add|remov/);
  });

  it("target_audience_stated description mentions null if not found", () => {
    expect(HOMEPAGE_SCHEMA.properties.target_audience_stated.description.toLowerCase()).toMatch(/null/);
  });

  it("nav_primary_items description mentions navigation", () => {
    expect(HOMEPAGE_SCHEMA.properties.nav_primary_items.description.toLowerCase()).toMatch(/nav/);
  });
});

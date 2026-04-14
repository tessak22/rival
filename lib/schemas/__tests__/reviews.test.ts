import { describe, expect, it } from "vitest";

import { REVIEWS_EXPECTED_FIELDS, REVIEWS_SCHEMA } from "@/lib/schemas/reviews";

describe("REVIEWS_SCHEMA structure", () => {
  it("is a valid JSON schema object", () => {
    expect(REVIEWS_SCHEMA.type).toBe("object");
    expect(REVIEWS_SCHEMA.properties).toBeDefined();
    expect(Object.keys(REVIEWS_SCHEMA.properties).length).toBeGreaterThanOrEqual(3);
  });

  it("has a required array that references real properties", () => {
    expect(REVIEWS_SCHEMA.required).toBeDefined();
    expect(REVIEWS_SCHEMA.required.length).toBeGreaterThan(0);
    for (const field of REVIEWS_SCHEMA.required) {
      expect(Object.keys(REVIEWS_SCHEMA.properties)).toContain(field);
    }
  });
});

describe("REVIEWS_EXPECTED_FIELDS", () => {
  it("is non-empty and matches REVIEWS_SCHEMA.required exactly", () => {
    expect(REVIEWS_EXPECTED_FIELDS.length).toBeGreaterThan(0);
    expect([...REVIEWS_EXPECTED_FIELDS].sort()).toEqual([...REVIEWS_SCHEMA.required].sort());
  });

  it("references only real schema property keys", () => {
    for (const field of REVIEWS_EXPECTED_FIELDS) {
      expect(typeof field).toBe("string");
      expect(Object.keys(REVIEWS_SCHEMA.properties)).toContain(field);
    }
  });
});

describe("REVIEWS_SCHEMA content", () => {
  it("includes platform field for cross-platform schema reuse", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("platform");
    expect(REVIEWS_SCHEMA.properties.platform.type).toBe("string");
  });

  it("includes overall_rating as a required field", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("overall_rating");
    expect(REVIEWS_SCHEMA.properties.overall_rating.type).toBe("number");
    expect(REVIEWS_SCHEMA.required).toContain("overall_rating");
  });

  it("includes review_count as a required field", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("review_count");
    expect(REVIEWS_SCHEMA.properties.review_count.type).toBe("number");
    expect(REVIEWS_SCHEMA.required).toContain("review_count");
  });

  it("includes top_praise_themes as required array", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("top_praise_themes");
    expect(REVIEWS_SCHEMA.properties.top_praise_themes.type).toBe("array");
    expect(REVIEWS_SCHEMA.required).toContain("top_praise_themes");
  });

  it("includes top_complaint_themes as required array — highest-signal field", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("top_complaint_themes");
    expect(REVIEWS_SCHEMA.properties.top_complaint_themes.type).toBe("array");
    expect(REVIEWS_SCHEMA.required).toContain("top_complaint_themes");
    // top_complaint_themes should appear in the description as highest-signal
    expect(REVIEWS_SCHEMA.properties.top_complaint_themes.description).toMatch(/highest.signal/i);
  });

  it("includes optional sub-scores for ease of use and customer support", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("ease_of_use_score");
    expect(REVIEWS_SCHEMA.properties.ease_of_use_score.type).toBe("number");
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("customer_support_score");
    expect(REVIEWS_SCHEMA.properties.customer_support_score.type).toBe("number");
    // Sub-scores are optional — not in required
    expect(REVIEWS_SCHEMA.required).not.toContain("ease_of_use_score");
    expect(REVIEWS_SCHEMA.required).not.toContain("customer_support_score");
  });

  it("includes recent_reviews as optional array of review objects", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("recent_reviews");
    expect(REVIEWS_SCHEMA.properties.recent_reviews.type).toBe("array");
    // recent_reviews is optional
    expect(REVIEWS_SCHEMA.required).not.toContain("recent_reviews");
    // Review items should have rating, summary, date
    const itemProps = REVIEWS_SCHEMA.properties.recent_reviews.items.properties;
    expect(itemProps).toHaveProperty("rating");
    expect(itemProps).toHaveProperty("summary");
    expect(itemProps).toHaveProperty("date");
  });

  it("includes recommended_percentage as optional number", () => {
    expect(REVIEWS_SCHEMA.properties).toHaveProperty("recommended_percentage");
    expect(REVIEWS_SCHEMA.properties.recommended_percentage.type).toBe("number");
    expect(REVIEWS_SCHEMA.required).not.toContain("recommended_percentage");
  });
});

describe("REVIEWS_SCHEMA index re-exports", () => {
  it("exports REVIEWS_SCHEMA and REVIEWS_EXPECTED_FIELDS from the index", async () => {
    const index = await import("@/lib/schemas");
    expect(index).toHaveProperty("REVIEWS_SCHEMA");
    expect(index).toHaveProperty("REVIEWS_EXPECTED_FIELDS");
  });
});

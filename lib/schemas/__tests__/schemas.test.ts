import { describe, expect, it } from "vitest";

import {
  CAREERS_EXPECTED_FIELDS,
  CAREERS_SCHEMA,
  CHANGELOG_EXPECTED_FIELDS,
  CHANGELOG_SCHEMA,
  DOCS_EXPECTED_FIELDS,
  DOCS_SCHEMA,
  GITHUB_EXPECTED_FIELDS,
  GITHUB_SCHEMA,
  PRICING_EXPECTED_FIELDS,
  PRICING_SCHEMA,
  PROFILE_EXPECTED_FIELDS,
  PROFILE_SCHEMA,
  SOCIAL_EXPECTED_FIELDS,
  SOCIAL_SCHEMA,
  STACK_EXPECTED_FIELDS,
  STACK_SCHEMA
} from "@/lib/schemas";

const allSchemas = [
  { name: "pricing", schema: PRICING_SCHEMA, expected: PRICING_EXPECTED_FIELDS },
  { name: "careers", schema: CAREERS_SCHEMA, expected: CAREERS_EXPECTED_FIELDS },
  { name: "changelog", schema: CHANGELOG_SCHEMA, expected: CHANGELOG_EXPECTED_FIELDS },
  { name: "docs", schema: DOCS_SCHEMA, expected: DOCS_EXPECTED_FIELDS },
  { name: "github", schema: GITHUB_SCHEMA, expected: GITHUB_EXPECTED_FIELDS },
  { name: "social", schema: SOCIAL_SCHEMA, expected: SOCIAL_EXPECTED_FIELDS },
  { name: "profile", schema: PROFILE_SCHEMA, expected: PROFILE_EXPECTED_FIELDS },
  { name: "stack", schema: STACK_SCHEMA, expected: STACK_EXPECTED_FIELDS }
] as const;

describe("schema structure", () => {
  for (const { name, schema } of allSchemas) {
    it(`${name}: is a valid JSON schema object`, () => {
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(Object.keys(schema.properties).length).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("expected fields", () => {
  for (const { name, schema, expected } of allSchemas) {
    it(`${name}: EXPECTED_FIELDS is non-empty and references real properties`, () => {
      expect(expected.length).toBeGreaterThan(0);
      for (const field of expected) {
        expect(typeof field).toBe("string");
        expect(Object.keys(schema.properties)).toContain(field);
      }
    });
  }
});

describe("required fields", () => {
  for (const { name, schema } of allSchemas) {
    it(`${name}: has a required array matching expected fields`, () => {
      expect(schema.required).toBeDefined();
      expect(schema.required.length).toBeGreaterThan(0);
      for (const field of schema.required) {
        expect(Object.keys(schema.properties)).toContain(field);
      }
    });
  }
});

describe("index re-exports", () => {
  it("exports all schemas from the index", async () => {
    const index = await import("@/lib/schemas");
    const expectedExports = [
      "PRICING_SCHEMA",
      "PRICING_EXPECTED_FIELDS",
      "CAREERS_SCHEMA",
      "CAREERS_EXPECTED_FIELDS",
      "CHANGELOG_SCHEMA",
      "CHANGELOG_EXPECTED_FIELDS",
      "DOCS_SCHEMA",
      "DOCS_EXPECTED_FIELDS",
      "GITHUB_SCHEMA",
      "GITHUB_EXPECTED_FIELDS",
      "SOCIAL_SCHEMA",
      "SOCIAL_EXPECTED_FIELDS",
      "PROFILE_SCHEMA",
      "PROFILE_EXPECTED_FIELDS",
      "STACK_SCHEMA",
      "STACK_EXPECTED_FIELDS"
    ];

    for (const name of expectedExports) {
      expect(index).toHaveProperty(name);
    }
  });
});

describe("schema content", () => {
  it("pricing schema includes tier fields for competitive comparison", () => {
    const tierProps = PRICING_SCHEMA.properties.tiers.items.properties;
    expect(tierProps).toHaveProperty("name");
    expect(tierProps).toHaveProperty("price");
    expect(tierProps).toHaveProperty("is_self_serve");
  });

  it("careers schema captures tech stack from job descriptions", () => {
    const roleProps = CAREERS_SCHEMA.properties.open_roles.items.properties;
    expect(roleProps).toHaveProperty("tech_stack_mentioned");
    expect(CAREERS_SCHEMA.properties).toHaveProperty("aggregate_tech_stack");
  });

  it("github schema tracks release history", () => {
    expect(GITHUB_SCHEMA.properties).toHaveProperty("recent_releases");
    expect(GITHUB_SCHEMA.properties).toHaveProperty("open_issues");
  });
});

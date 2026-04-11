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

describe("required ↔ EXPECTED_FIELDS sync", () => {
  for (const { name, schema, expected } of allSchemas) {
    it(`${name}: EXPECTED_FIELDS matches required exactly`, () => {
      expect([...expected].sort()).toEqual([...schema.required].sort());
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

  it("changelog schema captures update cadence and recent features", () => {
    expect(CHANGELOG_SCHEMA.properties).toHaveProperty("last_update_date");
    expect(CHANGELOG_SCHEMA.properties).toHaveProperty("recent_features");
    expect(CHANGELOG_SCHEMA.properties).toHaveProperty("cadence");
    expect(CHANGELOG_SCHEMA.properties.recent_features.type).toBe("array");
  });

  it("docs schema identifies content opportunity signals", () => {
    expect(DOCS_SCHEMA.properties).toHaveProperty("has_api_reference");
    expect(DOCS_SCHEMA.properties).toHaveProperty("has_sdk_docs");
    expect(DOCS_SCHEMA.properties).toHaveProperty("has_tutorials");
    expect(DOCS_SCHEMA.properties).toHaveProperty("sections");
    expect(DOCS_SCHEMA.properties.sections.type).toBe("array");
  });

  it("profile schema captures leadership and positioning", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("mission_statement");
    expect(PROFILE_SCHEMA.properties).toHaveProperty("positioning");
    const leadershipItems = PROFILE_SCHEMA.properties.key_leadership.items;
    expect(leadershipItems.properties).toHaveProperty("name");
    expect(leadershipItems.properties).toHaveProperty("title");
  });

  it("profile schema has 12 fields total after issue #60 expansion", () => {
    expect(Object.keys(PROFILE_SCHEMA.properties).length).toBe(12);
  });

  it("profile schema includes target_company_size as a string field", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("target_company_size");
    expect(PROFILE_SCHEMA.properties.target_company_size.type).toBe("string");
  });

  it("profile schema includes target_industries as an array of strings", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("target_industries");
    expect(PROFILE_SCHEMA.properties.target_industries.type).toBe("array");
    expect(PROFILE_SCHEMA.properties.target_industries.items.type).toBe("string");
  });

  it("profile schema includes customer_logos as an array of strings", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("customer_logos");
    expect(PROFILE_SCHEMA.properties.customer_logos.type).toBe("array");
    expect(PROFILE_SCHEMA.properties.customer_logos.items.type).toBe("string");
  });

  it("profile schema includes use_cases_stated as an array of strings", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("use_cases_stated");
    expect(PROFILE_SCHEMA.properties.use_cases_stated.type).toBe("array");
    expect(PROFILE_SCHEMA.properties.use_cases_stated.items.type).toBe("string");
  });

  it("profile schema includes founded_year as a number field", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("founded_year");
    expect(PROFILE_SCHEMA.properties.founded_year.type).toBe("number");
  });

  it("profile schema includes team_size_stated as a string field", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("team_size_stated");
    expect(PROFILE_SCHEMA.properties.team_size_stated.type).toBe("string");
  });

  it("profile schema includes offices_or_locations as an array of strings", () => {
    expect(PROFILE_SCHEMA.properties).toHaveProperty("offices_or_locations");
    expect(PROFILE_SCHEMA.properties.offices_or_locations.type).toBe("array");
    expect(PROFILE_SCHEMA.properties.offices_or_locations.items.type).toBe("string");
  });

  it("social schema tracks follower counts and post topics", () => {
    expect(SOCIAL_SCHEMA.properties).toHaveProperty("followers");
    expect(SOCIAL_SCHEMA.properties).toHaveProperty("platform");
    expect(SOCIAL_SCHEMA.properties).toHaveProperty("recent_post_topics");
    expect(SOCIAL_SCHEMA.properties).toHaveProperty("posting_frequency");
    expect(SOCIAL_SCHEMA.properties.recent_post_topics.type).toBe("array");
  });

  it("stack schema captures SDK language and integration gaps", () => {
    expect(STACK_SCHEMA.properties).toHaveProperty("languages");
    expect(STACK_SCHEMA.properties).toHaveProperty("sdk_languages");
    expect(STACK_SCHEMA.properties).toHaveProperty("ide_plugins");
    expect(STACK_SCHEMA.properties).toHaveProperty("cli_available");
    expect(STACK_SCHEMA.properties.languages.type).toBe("array");
  });
});

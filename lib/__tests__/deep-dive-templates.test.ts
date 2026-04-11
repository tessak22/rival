import { describe, expect, it } from "vitest";
import { DEEP_DIVE_TEMPLATES, buildPromptForTemplate } from "@/lib/deep-dive-templates";

describe("DEEP_DIVE_TEMPLATES", () => {
  it("exports exactly 3 templates", () => {
    expect(DEEP_DIVE_TEMPLATES).toHaveLength(3);
  });

  it("has unique keys", () => {
    const keys = DEEP_DIVE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes messaging, developer-sentiment, and strategic-moves keys", () => {
    const keys = DEEP_DIVE_TEMPLATES.map((t) => t.key);
    expect(keys).toContain("messaging");
    expect(keys).toContain("developer-sentiment");
    expect(keys).toContain("strategic-moves");
  });

  it("each template has a non-empty label and description", () => {
    for (const template of DEEP_DIVE_TEMPLATES) {
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
    }
  });

  it("each template's buildPrompt interpolates the competitor name", () => {
    for (const template of DEEP_DIVE_TEMPLATES) {
      const prompt = template.buildPrompt("Acme Corp");
      expect(prompt).toContain("Acme Corp");
    }
  });
});

describe("buildPromptForTemplate", () => {
  it("returns the interpolated prompt for a valid key", () => {
    const prompt = buildPromptForTemplate("messaging", "Acme");
    expect(typeof prompt).toBe("string");
    expect(prompt).not.toBeNull();
    expect(prompt as string).toContain("Acme");
  });

  it("returns null for an unknown key", () => {
    const result = buildPromptForTemplate("unknown-key", "Acme");
    expect(result).toBeNull();
  });

  it("returns null for an empty string key", () => {
    const result = buildPromptForTemplate("", "Acme");
    expect(result).toBeNull();
  });

  it("interpolates competitor name correctly in messaging template", () => {
    const prompt = buildPromptForTemplate("messaging", "TestCo");
    expect(prompt).toContain("TestCo");
    expect(prompt).toContain("POSITIONING");
  });

  it("interpolates competitor name correctly in developer-sentiment template", () => {
    const prompt = buildPromptForTemplate("developer-sentiment", "TestCo");
    expect(prompt).toContain("TestCo");
    expect(prompt).toContain("GITHUB");
  });

  it("interpolates competitor name correctly in strategic-moves template", () => {
    const prompt = buildPromptForTemplate("strategic-moves", "TestCo");
    expect(prompt).toContain("TestCo");
    expect(prompt).toContain("FUNDING");
  });
});

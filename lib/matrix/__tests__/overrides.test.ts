import { describe, expect, it } from "vitest";
import { getAxisScore } from "@/lib/matrix/overrides";

describe("getAxisScore", () => {
  it("returns null when both manual_data and brief are empty", () => {
    expect(getAxisScore(null, null, "managed_service_score")).toBeNull();
  });

  it("returns brief score with isOverride: false when no override present", () => {
    const brief = { managed_service_score: 7 };
    expect(getAxisScore(null, brief, "managed_service_score")).toEqual({ score: 7, isOverride: false });
  });

  it("returns override score with isOverride: true when override present", () => {
    const manual = { matrix_overrides: { managed_service_score: 9 } };
    const brief = { managed_service_score: 3 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 9, isOverride: true });
  });

  it("falls back to brief when override key is missing for requested axis", () => {
    const manual = { matrix_overrides: { llm_included_score: 8 } };
    const brief = { managed_service_score: 5 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 5, isOverride: false });
  });

  it("clamps brief score to 0–10", () => {
    const brief = { managed_service_score: 15 };
    expect(getAxisScore(null, brief, "managed_service_score")).toEqual({ score: 10, isOverride: false });
  });

  it("clamps override score to 0–10", () => {
    const manual = { matrix_overrides: { managed_service_score: -3 } };
    expect(getAxisScore(manual, null, "managed_service_score")).toEqual({ score: 0, isOverride: true });
  });

  it("returns null when brief score is non-numeric", () => {
    const brief = { managed_service_score: "high" };
    expect(getAxisScore(null, brief, "managed_service_score")).toBeNull();
  });

  it("returns null when override is non-numeric", () => {
    const manual = { matrix_overrides: { managed_service_score: "high" } };
    expect(getAxisScore(manual, null, "managed_service_score")).toBeNull();
  });

  it("ignores override when matrix_overrides is not an object", () => {
    const manual = { matrix_overrides: "invalid" };
    const brief = { managed_service_score: 4 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 4, isOverride: false });
  });
});

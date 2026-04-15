import { describe, it, expect } from "vitest";
import { getScanBadge } from "../scan-badge";

describe("getScanBadge", () => {
  it("returns CHANGED + changed variant for hasChanges=true", () => {
    expect(getScanBadge(true)).toEqual({ label: "CHANGED", variant: "changed" });
  });

  it("returns NO CHANGE + no-change variant for hasChanges=false", () => {
    expect(getScanBadge(false)).toEqual({ label: "NO CHANGE", variant: "no-change" });
  });

  it("returns UNKNOWN + unknown variant for null", () => {
    expect(getScanBadge(null)).toEqual({ label: "UNKNOWN", variant: "unknown" });
  });
});

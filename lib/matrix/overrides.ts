import type { MatrixAxisKey } from "@/lib/config/rival-config";

export type AxisScoreResult = {
  score: number;
  isOverride: boolean;
};

export function getAxisScore(
  manualData: unknown,
  intelligenceBrief: unknown,
  key: MatrixAxisKey
): AxisScoreResult | null {
  // Check manual_data.matrix_overrides first
  if (manualData && typeof manualData === "object" && !Array.isArray(manualData)) {
    const overrides = (manualData as Record<string, unknown>).matrix_overrides;
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      const val = (overrides as Record<string, unknown>)[key];
      if (typeof val === "number" && Number.isFinite(val)) {
        return { score: Math.max(0, Math.min(10, val)), isOverride: true };
      }
    }
  }

  // Fall back to intelligenceBrief
  if (intelligenceBrief && typeof intelligenceBrief === "object" && !Array.isArray(intelligenceBrief)) {
    const val = (intelligenceBrief as Record<string, unknown>)[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      return { score: Math.max(0, Math.min(10, val)), isOverride: false };
    }
  }

  return null;
}

export type BadgeVariant = "changed" | "no-change" | "unknown";

export interface ScanBadge {
  label: string;
  variant: BadgeVariant;
}

export function getScanBadge(hasChanges: boolean | null): ScanBadge {
  if (hasChanges === true) return { label: "CHANGED", variant: "changed" };
  if (hasChanges === false) return { label: "NO CHANGE", variant: "no-change" };
  return { label: "UNKNOWN", variant: "unknown" };
}

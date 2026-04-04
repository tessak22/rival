export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  // Use a WeakSet replacer to handle circular references, and wrap in try-catch
  // to guard against non-serializable values like BigInt (which JSON.stringify
  // throws for rather than returning null/undefined — so ?? cannot catch it).
  try {
    const seen = new WeakSet();
    return (
      JSON.stringify(value, (_key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val as unknown;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

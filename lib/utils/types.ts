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

  // Track only the current ancestor path (not all visited objects) to correctly
  // distinguish true circular references from shared/diamond references.
  // A shared object { a: x, b: x } is safe — only flag x if it appears in its
  // own ancestor chain. Uses JSON.stringify's `this` context to trim the stack
  // as traversal moves between siblings.
  // Wrapped in try-catch for non-serializable values like BigInt.
  try {
    const ancestors = new Set<object>();
    const stack: object[] = [];
    return (
      JSON.stringify(value, function (this: unknown, _key, val) {
        if (typeof val === "object" && val !== null) {
          // Trim the stack back to the current parent so siblings don't
          // inherit each other's children as ancestors.
          while (stack.length > 0 && stack[stack.length - 1] !== this) {
            const top = stack.pop();
            if (top !== undefined) ancestors.delete(top);
          }
          if (ancestors.has(val)) return "[Circular]";
          ancestors.add(val);
          stack.push(val);
        }
        return val as unknown;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

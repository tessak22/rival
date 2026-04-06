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
  // own ancestor chain.
  //
  // Implementation note: uses JSON.stringify's `this` context in the replacer
  // to identify the current parent object and trim the ancestor stack when
  // traversal moves to a sibling subtree. This behaviour — `this` referring to
  // the containing object — is consistent across V8, SpiderMonkey, and JSC and
  // matches the intent of the spec (ECMA-262 §25.5.2.1), though the spec does
  // not explicitly mandate it for replacer functions.
  //
  // `ancestors` is a WeakSet (not Set) so serialized objects are not retained
  // beyond the lifetime of the replacer call; `stack` is a plain array because
  // WeakSet does not support indexed access needed for the trim loop.
  //
  // Wrapped in try-catch for non-serializable values like BigInt.
  try {
    const ancestors = new WeakSet<object>();
    const stack: object[] = [];
    return (
      JSON.stringify(value, function (this: unknown, _key, val) {
        if (typeof val === "object" && val !== null) {
          // On the first call `this` is JSON.stringify's synthetic {"":rootValue}
          // wrapper — the empty stack guard means no trimming occurs and the root
          // object is simply pushed, which is correct.
          //
          // On subsequent calls, trim the stack back to the current parent (`this`)
          // before checking for cycles. This removes children of previously visited
          // siblings from the ancestor set so that shared references — objects
          // reachable via multiple paths — are not incorrectly flagged as circular.
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

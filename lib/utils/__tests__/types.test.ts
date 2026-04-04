import { describe, expect, it } from "vitest";
import { isPlainObject, stringifyUnknown } from "@/lib/utils/types";

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("stringifyUnknown", () => {
  it("returns Error name and message for Error instances", () => {
    const err = new Error("something broke");
    expect(stringifyUnknown(err)).toBe("Error: something broke");
  });

  it("returns strings as-is", () => {
    expect(stringifyUnknown("hello")).toBe("hello");
  });

  it("serializes plain objects as JSON", () => {
    expect(stringifyUnknown({ a: 1, b: "two" })).toBe('{"a":1,"b":"two"}');
  });

  it("serializes arrays as JSON", () => {
    expect(stringifyUnknown([1, 2, 3])).toBe("[1,2,3]");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    const result = stringifyUnknown(obj);
    expect(result).toContain("[Circular]");
    expect(result).toContain('"a":1');
  });

  it("does not mark shared (non-circular) references as circular", () => {
    // Diamond pattern: both a and b point to the same object but there is no cycle.
    // The old WeakSet approach incorrectly returned "[Circular]" for the second reference.
    const shared = { x: 1 };
    const obj = { a: shared, b: shared };
    expect(stringifyUnknown(obj)).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it("does not mark shared references at multiple depths as circular", () => {
    // shared is nested inside two sibling wrapper objects — still not a cycle.
    const shared = { x: 1 };
    const obj = { p: { shared }, q: { shared } };
    const result = stringifyUnknown(obj);
    expect(result).toBe('{"p":{"shared":{"x":1}},"q":{"shared":{"x":1}}}');
    expect(result).not.toContain("[Circular]");
  });

  it("does not mark shared references inside arrays as circular", () => {
    const shared = { x: 1 };
    const arr = [shared, shared, shared];
    expect(stringifyUnknown(arr)).toBe('[{"x":1},{"x":1},{"x":1}]');
  });

  it("detects circular references at depth, not just at root", () => {
    const inner: Record<string, unknown> = { y: 2 };
    inner["self"] = inner;
    const obj = { outer: 1, inner };
    const result = stringifyUnknown(obj);
    expect(result).toContain("[Circular]");
    expect(result).toContain('"y":2');
    expect(result).toContain('"outer":1');
  });

  it("handles null values in objects without throwing", () => {
    expect(stringifyUnknown({ a: null, b: 1 })).toBe('{"a":null,"b":1}');
  });

  it("handles shared object that is itself circular", () => {
    // circ is both shared (referenced from a and b) and circular (self-referential).
    // Each reference should detect the cycle independently.
    const circ: Record<string, unknown> = {};
    circ["self"] = circ;
    const obj = { a: circ, b: circ };
    const result = stringifyUnknown(obj);
    expect(result).toContain('"self":"[Circular]"');
    // Both a and b should be serialized (shared ref handled), each with their own [Circular]
    expect(result).toContain('"a":{');
    expect(result).toContain('"b":{');
  });

  it("falls back to String() for BigInt (non-serializable by JSON.stringify)", () => {
    // BigInt causes JSON.stringify to throw — the try-catch must handle it
    expect(stringifyUnknown(BigInt(42))).toBe("42");
  });

  it("falls back to String() for functions (JSON.stringify returns undefined)", () => {
    const fn = () => {};
    expect(stringifyUnknown(fn)).toBe(String(fn));
  });

  it("falls back to String() for undefined", () => {
    expect(stringifyUnknown(undefined)).toBe("undefined");
  });

  it("serializes numbers and booleans", () => {
    expect(stringifyUnknown(42)).toBe("42");
    expect(stringifyUnknown(true)).toBe("true");
  });
});

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

  it("falls back to String() for BigInt (non-serializable by JSON.stringify)", () => {
    // BigInt causes JSON.stringify to throw — the try-catch must handle it
    expect(stringifyUnknown(42n)).toBe("42");
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

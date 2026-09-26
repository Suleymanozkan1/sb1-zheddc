import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits } from "../src";

describe("token amounts", () => {
  it("round-trips without floating point errors", () => {
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits("123456789", 6, 2)).toBe("123.45");
  });

  it("rejects invalid or over-precise input", () => {
    expect(() => parseUnits("1.0000001", 6)).toThrow();
    expect(() => parseUnits("-1", 6)).toThrow();
    expect(() => parseUnits("1e9", 6)).toThrow();
  });
});

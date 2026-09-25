/** Formats integer base units (bigint or decimal string) with the given decimals, without float rounding. */
export function formatUnits(value: bigint | string, decimals: number, maxFraction = decimals): string {
  const v = typeof value === "bigint" ? value : BigInt(value);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction);
  fraction = fraction.replace(/0+$/, "");
  const out = fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${out}` : out;
}

/** Parses a human decimal string ("1.25") into integer base units. Throws on invalid input or excess precision. */
export function parseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`Too many decimal places (max ${decimals})`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

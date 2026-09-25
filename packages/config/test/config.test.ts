import { describe, expect, it } from "vitest";
import { parseConfig } from "../src";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: "x".repeat(40),
};

describe("config guards", () => {
  it("defaults to devnet", () => {
    expect(parseConfig({ ...base }).SOLANA_NETWORK).toBe("devnet");
  });

  it("refuses mainnet unless production + ALLOW_MAINNET", () => {
    expect(() => parseConfig({ ...base, SOLANA_NETWORK: "mainnet-beta" })).toThrow(/mainnet/);
    expect(() => parseConfig({ ...base, NODE_ENV: "production", SOLANA_NETWORK: "mainnet-beta", ALLOW_GUESTS: "false" })).toThrow(/mainnet/);
    expect(parseConfig({ ...base, NODE_ENV: "production", SOLANA_NETWORK: "mainnet-beta", ALLOW_MAINNET: "true" }).SOLANA_NETWORK).toBe("mainnet-beta");
  });

  it("refuses the mock chain and weak secrets in production", () => {
    expect(() => parseConfig({ ...base, NODE_ENV: "production", SOLANA_MOCK: "true" })).toThrow(/SOLANA_MOCK/);
    expect(() => parseConfig({ ...base, NODE_ENV: "production", JWT_SECRET: "change-me-change-me-change-me-change-me" })).toThrow(/JWT_SECRET/);
    expect(() => parseConfig({ ...base, JWT_SECRET: "short" })).toThrow();
  });

  it("validates withdrawal limits", () => {
    expect(() => parseConfig({ ...base, MIN_WITHDRAWAL: "100", MAX_WITHDRAWAL: "10" })).toThrow();
    expect(() => parseConfig({ ...base, WITHDRAWAL_FEE: "5000000", MIN_WITHDRAWAL: "5000000" })).toThrow();
    expect(parseConfig({ ...base }).MIN_WITHDRAWAL).toBeTypeOf("bigint");
  });
});

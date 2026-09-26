// Centralised, validated configuration. Every tunable (limits, pools, tick rate, RPC, mint...)
// comes from the environment; secrets are never hard-coded.

import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const bigintStr = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer (token base units)")
  .transform((v) => BigInt(v));

const NETWORKS = ["devnet", "testnet", "mainnet-beta", "localnet"] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional().default(""),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  GAME_TICKET_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  COOKIE_DOMAIN: z.string().optional().default(""),
  PUBLIC_WEB_ORIGINS: z.string().default("http://localhost:5173,http://localhost:5174"),
  ALLOW_GUESTS: bool.default(true),
  /** Header set by a trusted edge proxy with the client's ISO country (e.g. cf-ipcountry). Empty = disabled. */
  GEO_COUNTRY_HEADER: z.string().default(""),
  /** Number of trusted reverse proxies in front of the API (for client IP resolution). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().default(3000),
  GAME_HOST: z.string().default("0.0.0.0"),
  GAME_PORT: z.coerce.number().int().default(2567),
  BLOCKCHAIN_SERVICE_PORT: z.coerce.number().int().default(3100),

  // Game
  GAME_TICK_RATE: z.coerce.number().int().min(10).max(128).default(60),
  GAME_PATCH_RATE_MS: z.coerce.number().int().min(16).max(500).default(50),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(200).default(50),
  RANKED_MAX_PLAYERS: z.coerce.number().int().min(2).max(100).default(12),
  RANKED_MIN_PLAYERS: z.coerce.number().int().min(1).max(100).default(2),
  RANKED_MATCH_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  ARENA_SIZE: z.coerce.number().int().min(2000).max(20000).default(10000),
  NPC_DENSITY: z.coerce.number().min(0).max(3).default(1),
  DEV_BOTS: z.coerce.number().int().min(0).max(100).default(0),
  ARENA_MAP_SEED: z.coerce.number().int().default(1337),

  // Solana
  SOLANA_NETWORK: z.enum(NETWORKS).default("devnet"),
  SOLANA_RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  SOLANA_COMMITMENT: z.enum(["confirmed", "finalized"]).default("finalized"),
  SOLANA_MOCK: bool.default(false),
  ALLOW_MAINNET: bool.default(false),
  TREASURY_PUBLIC_KEY: z.string().optional().default(""),
  /** Base58 or JSON byte-array secret key. Only read by the blockchain-service. */
  TREASURY_SECRET: z.string().optional().default(""),
  REWARD_TOKEN_MINT: z.string().optional().default(""),
  REWARD_TOKEN_DECIMALS: z.coerce.number().int().min(0).max(12).default(6),
  REWARD_TOKEN_SYMBOL: z.string().default("ARENA"),
  DEPOSIT_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(120).default(20),

  // Economy (token base units)
  MIN_DEPOSIT: bigintStr.prefault("1000000"),
  MAX_DEPOSIT: bigintStr.prefault("1000000000000"),
  MIN_WITHDRAWAL: bigintStr.prefault("5000000"),
  MAX_WITHDRAWAL: bigintStr.prefault("500000000"),
  DAILY_WITHDRAWAL_LIMIT: bigintStr.prefault("1000000000"),
  WITHDRAWAL_FEE: bigintStr.prefault("100000"),
  WITHDRAWAL_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(3600),
  WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS: z.coerce.number().int().min(0).default(24),
  WITHDRAWAL_REVIEW_THRESHOLD: bigintStr.prefault("200000000"),
  WITHDRAWAL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  WITHDRAWAL_RISK_SCORE_REVIEW: z.coerce.number().int().min(0).default(50),
  /** Daily crypto reward budget across all players (default ≈ season pool / 60 days). */
  REWARD_POOL: bigintStr.prefault("16000000000"),
  /** Season crypto reward pool used when bootstrapping a season. */
  SEASON_REWARD_POOL: bigintStr.prefault("1000000000000"),
  /** Per-user daily crypto reward cap (anti-farming; ~2x a hardcore player's legit earnings). */
  USER_DAILY_REWARD_CAP: bigintStr.prefault("100000000"),
  KILL_REWARD_BASE: bigintStr.prefault("200000"),
  PVP_SAME_VICTIM_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(600),
  /** PvP kills pay crypto only for non-guest victims at or above this level. */
  PVP_REWARD_MIN_VICTIM_LEVEL: z.coerce.number().int().min(1).default(5),
  /** Each earlier reward today for the same killer→victim pair multiplies the next one by this (bps). */
  PVP_REPEAT_DECAY_BPS: z.coerce.number().int().min(0).max(10_000).default(5_000),
  /** Ranked top-3 base reward; paid only with enough real players (scaled 50 % → 100 %). */
  RANKED_REWARD_BASE: bigintStr.prefault("2000000"),
  RANKED_REWARD_MIN_HUMANS: z.coerce.number().int().min(2).default(6),
  RANKED_REWARD_FULL_HUMANS: z.coerce.number().int().min(2).default(12),
  /** Crystal Titan reward, split by damage share among contributors above the minimum share. */
  TITAN_REWARD_BASE: bigintStr.prefault("5000000"),
  TITAN_MIN_DAMAGE_SHARE_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  TITAN_REWARDS_PER_USER_DAY: z.coerce.number().int().min(0).default(3),
  /** Gold paid when selling one item of each rarity (consumables: per unit, scaled by SELL_CONSUMABLE_BPS). */
  SELL_GOLD_COMMON: z.coerce.number().int().min(0).default(12),
  SELL_GOLD_UNCOMMON: z.coerce.number().int().min(0).default(30),
  SELL_GOLD_RARE: z.coerce.number().int().min(0).default(80),
  SELL_GOLD_EPIC: z.coerce.number().int().min(0).default(200),
  SELL_GOLD_LEGENDARY: z.coerce.number().int().min(0).default(500),
  SELL_GOLD_MYTHIC: z.coerce.number().int().min(0).default(1200),
  SELL_CONSUMABLE_BPS: z.coerce.number().int().min(0).max(10_000).default(2_500),
  /** Share of the gold spent on +N upgrades that selling returns (bps). Must stay below 100 %. */
  SELL_UPGRADE_REFUND_BPS: z.coerce.number().int().min(0).max(9_000).default(2_500),
  /** Maximum items per (bulk) sell request. */
  SELL_MAX_ITEMS: z.coerce.number().int().min(1).max(500).default(100),
  BLOCKED_COUNTRIES: z.string().default(""),
  MIN_AGE: z.coerce.number().int().min(0).default(18),
  REQUIRE_KYC_FOR_WITHDRAWAL: bool.default(false),
});

export type AppConfig = z.infer<typeof envSchema> & {
  webOrigins: string[];
  blockedCountries: Set<string>;
  isProduction: boolean;
};

let loaded = false;

/** Loads `.env` from the repository root (walking up from cwd) once. */
export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return;
    }
    dir = resolve(dir, "..");
  }
}

export class ConfigError extends Error {}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new ConfigError(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === "production";

  if (isProduction) {
    if (c.SOLANA_MOCK) throw new ConfigError("SOLANA_MOCK cannot be enabled in production");
    if (c.DEV_BOTS > 0) throw new ConfigError("DEV_BOTS must be 0 in production");
    if (/change[-_]?me|dev[-_]?secret/i.test(c.JWT_SECRET)) throw new ConfigError("JWT_SECRET looks like a development placeholder");
  }
  if (c.SOLANA_NETWORK === "mainnet-beta" && !(isProduction && c.ALLOW_MAINNET)) {
    throw new ConfigError("mainnet-beta requires NODE_ENV=production and ALLOW_MAINNET=true");
  }
  if (c.MIN_WITHDRAWAL > c.MAX_WITHDRAWAL) throw new ConfigError("MIN_WITHDRAWAL must be <= MAX_WITHDRAWAL");
  if (c.WITHDRAWAL_FEE >= c.MIN_WITHDRAWAL) throw new ConfigError("WITHDRAWAL_FEE must be < MIN_WITHDRAWAL");
  if (c.RANKED_REWARD_FULL_HUMANS < c.RANKED_REWARD_MIN_HUMANS) throw new ConfigError("RANKED_REWARD_FULL_HUMANS must be >= RANKED_REWARD_MIN_HUMANS");

  return {
    ...c,
    webOrigins: c.PUBLIC_WEB_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    blockedCountries: new Set(c.BLOCKED_COUNTRIES.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),
    isProduction,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    loadEnvFiles();
    cached = parseConfig(process.env);
  }
  return cached;
}

/** Test helper: override configuration values. */
export function setConfigForTests(overrides: Partial<Record<keyof z.input<typeof envSchema>, string>>): AppConfig {
  loadEnvFiles();
  cached = parseConfig({ ...process.env, ...overrides });
  return cached;
}

export function explorerTxUrl(signature: string, network: string): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network === "localnet" ? "custom" : network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

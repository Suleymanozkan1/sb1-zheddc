// Structured logging + metrics shared by every backend service.

import pino, { type Logger } from "pino";
import client from "prom-client";

/** Keys that must never reach logs. pino replaces them with "[REDACTED]". */
const REDACT_PATHS = [
  "*.password",
  "*.secret",
  "*.secretKey",
  "*.privateKey",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.ticket",
  "*.jwt",
  "*.signatureBytes",
  "*.signedMessage",
  "*.authorization",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "TREASURY_SECRET",
  "JWT_SECRET",
];

/** Canonical business events (use as the `event` field). */
export const LogEvent = {
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  WALLET_CONNECTED: "WALLET_CONNECTED",
  GAME_STARTED: "GAME_STARTED",
  GAME_ENDED: "GAME_ENDED",
  PLAYER_JOINED: "PLAYER_JOINED",
  PLAYER_LEFT: "PLAYER_LEFT",
  REWARD_GRANTED: "REWARD_GRANTED",
  REWARD_REJECTED: "REWARD_REJECTED",
  PURCHASE_CREATED: "PURCHASE_CREATED",
  PURCHASE_REFUNDED: "PURCHASE_REFUNDED",
  DEPOSIT_PREPARED: "DEPOSIT_PREPARED",
  DEPOSIT_DETECTED: "DEPOSIT_DETECTED",
  DEPOSIT_CONFIRMED: "DEPOSIT_CONFIRMED",
  DEPOSIT_REJECTED: "DEPOSIT_REJECTED",
  WITHDRAWAL_CREATED: "WITHDRAWAL_CREATED",
  WITHDRAWAL_SENT: "WITHDRAWAL_SENT",
  WITHDRAWAL_COMPLETED: "WITHDRAWAL_COMPLETED",
  WITHDRAWAL_FAILED: "WITHDRAWAL_FAILED",
  WITHDRAWAL_CANCELLED: "WITHDRAWAL_CANCELLED",
  ANTICHEAT_FLAG: "ANTICHEAT_FLAG",
  ADMIN_ACTION: "ADMIN_ACTION",
} as const;
export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];

export function createLogger(service: string, level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    name: service,
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };

// ───────────── Metrics ─────────────

export const registry = new client.Registry();

let defaultsRegistered = false;
export function registerDefaultMetrics(service: string): void {
  if (defaultsRegistered) return;
  defaultsRegistered = true;
  registry.setDefaultLabels({ service });
  client.collectDefaultMetrics({ register: registry });
}

export const metrics = {
  activePlayers: new client.Gauge({ name: "arena_active_players", help: "Connected players", registers: [registry] }),
  activeRooms: new client.Gauge({ name: "arena_active_rooms", help: "Active game rooms", registers: [registry] }),
  gamesStarted: new client.Counter({ name: "arena_games_started_total", help: "Matches started", registers: [registry] }),
  tickDuration: new client.Histogram({
    name: "arena_tick_duration_ms",
    help: "Simulation tick duration",
    buckets: [0.5, 1, 2, 4, 8, 16, 33],
    registers: [registry],
  }),
  playerLatency: new client.Histogram({
    name: "arena_player_latency_ms",
    help: "Client round-trip latency",
    buckets: [20, 50, 80, 120, 200, 400, 800],
    registers: [registry],
  }),
  httpRequests: new client.Counter({
    name: "http_requests_total",
    help: "HTTP requests",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  }),
  httpErrors: new client.Counter({ name: "http_errors_total", help: "HTTP 5xx responses", registers: [registry] }),
  dbLatency: new client.Histogram({
    name: "db_ping_latency_ms",
    help: "Database ping latency",
    buckets: [1, 2, 5, 10, 25, 50, 100, 250],
    registers: [registry],
  }),
  rpcLatency: new client.Histogram({
    name: "solana_rpc_latency_ms",
    help: "Solana RPC call latency",
    labelNames: ["method"],
    buckets: [50, 100, 200, 400, 800, 1600, 5000],
    registers: [registry],
  }),
  withdrawalQueue: new client.Gauge({
    name: "withdrawal_queue_size",
    help: "Withdrawals waiting to be processed",
    labelNames: ["status"],
    registers: [registry],
  }),
  antiCheatFlags: new client.Counter({
    name: "anticheat_flags_total",
    help: "Anti-cheat flags raised",
    labelNames: ["kind"],
    registers: [registry],
  }),
  rewardsGranted: new client.Counter({
    name: "rewards_granted_total",
    help: "Rewards granted",
    labelNames: ["source", "asset"],
    registers: [registry],
  }),
};

export async function timed<T>(histogram: client.Histogram<string>, labels: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const end = histogram.startTimer(labels);
  try {
    return await fn();
  } finally {
    end();
  }
}

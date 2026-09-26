import { assertNetwork, createSolanaGateway } from "@cryptoarena/blockchain";
import { getConfig } from "@cryptoarena/config";
import { createPrisma, disconnectAll } from "@cryptoarena/database";
import { createLogger, metrics, registerDefaultMetrics } from "@cryptoarena/observability";
import { Redis } from "ioredis";
import { buildApp } from "./app";
import type { ApiContext } from "./context";
import { startJobs } from "./jobs";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger("api", config.LOG_LEVEL);
  registerDefaultMetrics("api");

  const prisma = createPrisma(config.DATABASE_URL);
  const gateway = createSolanaGateway({
    network: config.SOLANA_NETWORK,
    rpcUrl: config.SOLANA_RPC_URL,
    mock: config.SOLANA_MOCK,
    observe: (method, ms) => metrics.rpcLatency.observe({ method }, ms),
  });
  if (!config.SOLANA_MOCK) {
    try {
      await assertNetwork(gateway);
    } catch (err) {
      logger.fatal({ err }, "Solana RPC network mismatch — refusing to start");
      process.exit(1);
    }
  } else {
    logger.warn("SOLANA_MOCK=true — deposits/withdrawals are simulated (development only)");
  }

  let redis: Redis | null = null;
  if (config.REDIS_URL) {
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true });
    redis.on("error", (err) => logger.warn({ err: err.message }, "redis error"));
    try {
      await redis.connect();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "redis unavailable, falling back to in-memory rate limiting");
      redis.disconnect();
      redis = null;
    }
  }

  const ctx: ApiContext = { prisma, config, logger, gateway, redis };
  const app = await buildApp(ctx);
  const stopJobs = startJobs(ctx);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    stopJobs();
    await app.close();
    redis?.disconnect();
    await disconnectAll();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ port: config.API_PORT, network: config.SOLANA_NETWORK }, "API listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

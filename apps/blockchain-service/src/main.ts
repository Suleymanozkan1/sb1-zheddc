import { createServer } from "node:http";
import { MockSolanaGateway, assertNetwork, createEnvTreasurySigner, createSolanaGateway, type TreasurySigner } from "@cryptoarena/blockchain";
import { getConfig } from "@cryptoarena/config";
import { createPrisma, disconnectAll, pingDatabase } from "@cryptoarena/database";
import { createLogger, metrics, registerDefaultMetrics, registry } from "@cryptoarena/observability";
import { WithdrawalWorker } from "./worker";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger("blockchain-service", config.LOG_LEVEL);
  registerDefaultMetrics("blockchain-service");
  const prisma = createPrisma(config.DATABASE_URL);

  const gateway = createSolanaGateway({
    network: config.SOLANA_NETWORK,
    rpcUrl: config.SOLANA_RPC_URL,
    mock: config.SOLANA_MOCK,
    observe: (method, ms) => metrics.rpcLatency.observe({ method }, ms),
  });

  let signer: TreasurySigner | null = null;
  if (config.SOLANA_MOCK) {
    logger.warn("SOLANA_MOCK=true — withdrawals are simulated, no tokens move (development only)");
    if (gateway instanceof MockSolanaGateway) gateway.landSentTransactions = true;
  } else {
    await assertNetwork(gateway);
    if (!config.REWARD_TOKEN_MINT) throw new Error("REWARD_TOKEN_MINT is required");
    // The secret is read once, parsed into a non-extractable signer and never logged.
    signer = await createEnvTreasurySigner(config.TREASURY_SECRET, config.TREASURY_PUBLIC_KEY || undefined);
    logger.info({ treasury: signer.address, network: config.SOLANA_NETWORK }, "treasury signer loaded");
  }

  const worker = new WithdrawalWorker({ ctx: { prisma, config, logger }, gateway, signer, mockTreasuryAddress: config.TREASURY_PUBLIC_KEY || "MockTreasury11111111111111111111111111111111" });
  const stop = worker.start();

  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok", service: "blockchain-service" }));
      } else if (req.url === "/ready") {
        try {
          const ms = await pingDatabase(prisma);
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ready", checks: { database: { ok: true, ms } } }));
        } catch (err) {
          res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ status: "degraded", error: (err as Error).message }));
        }
      } else if (req.url === "/metrics") {
        res.writeHead(200, { "content-type": registry.contentType }).end(await registry.metrics());
      } else {
        res.writeHead(404).end();
      }
    })();
  });
  // Internal only: bind to localhost unless explicitly exposed (e.g. inside a private Docker network).
  server.listen(config.BLOCKCHAIN_SERVICE_PORT, process.env.BLOCKCHAIN_SERVICE_HOST ?? "127.0.0.1", () =>
    logger.info({ port: config.BLOCKCHAIN_SERVICE_PORT }, "blockchain-service listening"),
  );

  const shutdown = async (): Promise<void> => {
    stop();
    server.close();
    await disconnectAll();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

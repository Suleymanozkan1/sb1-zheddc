import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { getConfig } from "@cryptoarena/config";
import { createPrisma, disconnectAll, pingDatabase } from "@cryptoarena/database";
import { createLogger, registerDefaultMetrics, registry } from "@cryptoarena/observability";
import { ROOM_NAMES } from "@cryptoarena/shared";
import type { Application, Request, Response } from "express";
import { ArenaRoom } from "./ArenaRoom";
import { Persistence } from "./persistence";
import { TicketVerifier } from "./tickets";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger("game-server", config.LOG_LEVEL);
  registerDefaultMetrics("game-server");
  const prisma = createPrisma(config.DATABASE_URL);

  // The game server never touches treasury keys: it only writes server-computed
  // results through the economy package (ledger, rewards, inventory).
  ArenaRoom.deps = { config, logger, persistence: new Persistence(prisma, config, logger), tickets: new TicketVerifier(config.JWT_SECRET) };

  const server = new Server({
    transport: new WebSocketTransport({ pingInterval: 5_000, pingMaxRetries: 3, maxPayload: 4 * 1024 }),
    gracefullyShutdown: true,
    express: (app: Application) => {
      app.get("/health", (_req: Request, res: Response) => {
        res.json({ status: "ok", service: "game-server", time: new Date().toISOString() });
      });
      app.get("/ready", async (_req: Request, res: Response) => {
        try {
          const ms = await pingDatabase(prisma);
          res.json({ status: "ready", checks: { database: { ok: true, ms } } });
        } catch (err) {
          res.status(503).json({ status: "degraded", checks: { database: { ok: false, error: (err as Error).message } } });
        }
      });
      app.get("/metrics", async (_req: Request, res: Response) => {
        res.setHeader("content-type", registry.contentType);
        res.send(await registry.metrics());
      });
    },
  });

  server.define(ROOM_NAMES.CASUAL, ArenaRoom, { mode: "CASUAL" });
  server.define(ROOM_NAMES.RANKED, ArenaRoom, { mode: "RANKED" });

  server.onShutdown(async () => {
    logger.info("game server shutting down");
    await ArenaRoom.deps.persistence.drain();
    await disconnectAll();
  });

  await server.listen(config.GAME_PORT, config.GAME_HOST);
  logger.info({ port: config.GAME_PORT, tickRate: config.GAME_TICK_RATE }, "game server listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

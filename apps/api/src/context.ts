import type { SolanaGateway } from "@cryptoarena/blockchain";
import type { AppConfig } from "@cryptoarena/config";
import type { Db } from "@cryptoarena/database";
import type { EconomyContext } from "@cryptoarena/economy";
import type { Logger } from "@cryptoarena/observability";
import type { Redis } from "ioredis";

export interface ApiContext extends EconomyContext {
  prisma: Db;
  config: AppConfig;
  logger: Logger;
  gateway: SolanaGateway;
  redis: Redis | null;
}

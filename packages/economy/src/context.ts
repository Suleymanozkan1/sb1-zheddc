import type { AppConfig } from "@cryptoarena/config";
import type { Db } from "@cryptoarena/database";
import type { Logger } from "@cryptoarena/observability";

/** Dependencies shared by every economy service. */
export interface EconomyContext {
  prisma: Db;
  config: AppConfig;
  logger: Logger;
}

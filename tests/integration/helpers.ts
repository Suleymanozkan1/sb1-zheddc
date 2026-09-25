import { randomBytes } from "node:crypto";
import { getConfig, setConfigForTests, type AppConfig } from "@cryptoarena/config";
import { createPrisma, withTransaction, type Db } from "@cryptoarena/database";
import { createUser, postJournal, transfer, type EconomyContext } from "@cryptoarena/economy";
import { createLogger } from "@cryptoarena/observability";
import { getBase58Decoder } from "@solana/kit";

export function ctx(overrides: Parameters<typeof setConfigForTests>[0] = {}): EconomyContext & { config: AppConfig; prisma: Db } {
  const config = Object.keys(overrides).length ? setConfigForTests(overrides) : getConfig();
  return { prisma: createPrisma(config.DATABASE_URL), config, logger: createLogger("test", "fatal") };
}

export function randomAddress(): string {
  return getBase58Decoder().decode(randomBytes(32));
}

export async function makeUser(c: EconomyContext, opts: { wallet?: boolean; guest?: boolean } = {}) {
  return withTransaction(c.prisma, async (tx) => {
    const user = await createUser(tx, { isGuest: opts.guest ?? false });
    const wallet = opts.wallet === false ? null : await tx.wallet.create({ data: { userId: user.id, address: randomAddress(), verifiedAt: new Date() } });
    return { user, wallet };
  });
}

/** Credits withdrawable rewards from the reward pool (test fixture). */
export async function creditReward(c: EconomyContext, userId: string, amount: bigint) {
  await withTransaction(c.prisma, (tx) =>
    postJournal(tx, {
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `test-credit:${randomBytes(8).toString("hex")}`,
      legs: transfer({ system: "CRYPTO_REWARD_POOL" }, { userId, kind: "CRYPTO_REWARD" }, amount),
    }),
  );
}

export async function creditGems(c: EconomyContext, userId: string, amount: bigint) {
  await withTransaction(c.prisma, (tx) =>
    postJournal(tx, {
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: `test-gems:${randomBytes(8).toString("hex")}`,
      legs: transfer({ system: "GEMS_ISSUANCE" }, { userId, kind: "GEMS" }, amount),
    }),
  );
}

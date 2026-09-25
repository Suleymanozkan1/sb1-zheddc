import type { AccountKind, Asset, Tx } from "@cryptoarena/database";

export const SYSTEM_ACCOUNTS = {
  GOLD_ISSUANCE: { asset: "GOLD", kind: "SYSTEM_ISSUANCE", allowNegative: true },
  GOLD_SINK: { asset: "GOLD", kind: "SYSTEM_REVENUE", allowNegative: false },
  GEMS_ISSUANCE: { asset: "GEMS", kind: "SYSTEM_ISSUANCE", allowNegative: true },
  GEMS_SINK: { asset: "GEMS", kind: "SYSTEM_REVENUE", allowNegative: false },
  /** Mirror of tokens entering/leaving the treasury on-chain. */
  CRYPTO_EXTERNAL: { asset: "CRYPTO", kind: "SYSTEM_EXTERNAL", allowNegative: true },
  CRYPTO_REVENUE: { asset: "CRYPTO", kind: "SYSTEM_REVENUE", allowNegative: false },
  /** Finite reward budget. Can never go negative → rewards can never exceed what was funded. */
  CRYPTO_REWARD_POOL: { asset: "CRYPTO", kind: "SYSTEM_REWARD_POOL", allowNegative: false },
  CRYPTO_WITHDRAWAL_CLEARING: { asset: "CRYPTO", kind: "SYSTEM_WITHDRAWAL_CLEARING", allowNegative: false },
  CRYPTO_FEES: { asset: "CRYPTO", kind: "SYSTEM_FEES", allowNegative: false },
} as const satisfies Record<string, { asset: Asset; kind: AccountKind; allowNegative: boolean }>;

export type SystemAccountKey = keyof typeof SYSTEM_ACCOUNTS;

export type UserAccountKind = "GOLD" | "GEMS" | "CRYPTO_SPENDABLE" | "CRYPTO_REWARD";

export const USER_ACCOUNT_ASSET: Record<UserAccountKind, Asset> = {
  GOLD: "GOLD",
  GEMS: "GEMS",
  CRYPTO_SPENDABLE: "CRYPTO",
  CRYPTO_REWARD: "CRYPTO",
};

export type AccountRef = { userId: string; kind: UserAccountKind } | { system: SystemAccountKey };

export interface ResolvedAccount {
  id: string;
  asset: Asset;
  userId: string | null;
}

/**
 * Returns the account id, creating it race-free (INSERT ... ON CONFLICT DO NOTHING) when missing.
 * Raw SQL is used so a concurrent insert never aborts the surrounding transaction.
 */
export async function resolveAccount(tx: Tx, ref: AccountRef): Promise<ResolvedAccount> {
  if ("system" in ref) {
    const def = SYSTEM_ACCOUNTS[ref.system];
    await tx.$executeRaw`
      INSERT INTO "BalanceAccount" (id, "ownerType", "systemKey", asset, kind, "allowNegative", balance, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'SYSTEM', ${ref.system}, CAST(${def.asset} AS "Asset"), CAST(${def.kind} AS "AccountKind"), ${def.allowNegative}, 0, now(), now())
      ON CONFLICT ("systemKey") DO NOTHING`;
    const acc = await tx.balanceAccount.findUniqueOrThrow({ where: { systemKey: ref.system }, select: { id: true, asset: true } });
    return { id: acc.id, asset: acc.asset, userId: null };
  }
  const asset = USER_ACCOUNT_ASSET[ref.kind];
  await tx.$executeRaw`
    INSERT INTO "BalanceAccount" (id, "ownerType", "userId", asset, kind, "allowNegative", balance, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), 'USER', CAST(${ref.userId} AS uuid), CAST(${asset} AS "Asset"), CAST(${ref.kind} AS "AccountKind"), false, 0, now(), now())
    ON CONFLICT ("userId", kind) DO NOTHING`;
  const acc = await tx.balanceAccount.findUniqueOrThrow({
    where: { userId_kind: { userId: ref.userId, kind: ref.kind } },
    select: { id: true, asset: true },
  });
  return { id: acc.id, asset: acc.asset, userId: ref.userId };
}

export async function ensureSystemAccounts(tx: Tx): Promise<void> {
  for (const key of Object.keys(SYSTEM_ACCOUNTS) as SystemAccountKey[]) {
    await resolveAccount(tx, { system: key });
  }
}

export interface UserBalances {
  gold: bigint;
  gems: bigint;
  cryptoSpendable: bigint;
  cryptoReward: bigint;
}

export async function getUserBalances(tx: Tx, userId: string): Promise<UserBalances> {
  const rows = await tx.balanceAccount.findMany({ where: { userId }, select: { kind: true, balance: true } });
  const get = (k: AccountKind): bigint => rows.find((r) => r.kind === k)?.balance ?? 0n;
  return { gold: get("GOLD"), gems: get("GEMS"), cryptoSpendable: get("CRYPTO_SPENDABLE"), cryptoReward: get("CRYPTO_REWARD") };
}

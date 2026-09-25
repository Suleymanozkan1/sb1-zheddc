import { getUserBalances } from "@cryptoarena/economy";
import type { BalancesDto, MeDto } from "@cryptoarena/shared";
import type { ApiContext } from "./context";

export async function buildBalances(ctx: ApiContext, userId: string): Promise<BalancesDto> {
  const b = await getUserBalances(ctx.prisma, userId);
  return {
    gold: b.gold.toString(),
    gems: b.gems.toString(),
    cryptoSpendable: b.cryptoSpendable.toString(),
    cryptoReward: b.cryptoReward.toString(),
    cryptoDecimals: ctx.config.REWARD_TOKEN_DECIMALS,
    cryptoSymbol: ctx.config.REWARD_TOKEN_SYMBOL,
  };
}

export async function buildMe(ctx: ApiContext, userId: string): Promise<MeDto> {
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wallets: true, admin: true } });
  const premiumActive = user.premiumUntil && user.premiumUntil > new Date();
  return {
    id: user.id,
    username: user.username,
    isGuest: user.isGuest,
    premiumTier: premiumActive ? user.premiumTier : "FREE",
    premiumUntil: premiumActive ? user.premiumUntil!.toISOString() : null,
    wallets: user.wallets.map((w) => ({ address: w.address, isPrimary: w.isPrimary })),
    adminRole: user.admin?.active ? user.admin.role : null,
    balances: await buildBalances(ctx, userId),
    createdAt: user.createdAt.toISOString(),
  };
}

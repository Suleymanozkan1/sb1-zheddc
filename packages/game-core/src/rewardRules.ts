// Pure anti-farming rules for crypto rewards. Thresholds come from config; these functions only
// turn them into multipliers so the game server and tests share one definition.

const BPS = 10_000;

/**
 * Ranked payouts scale with the number of real players in the match: nothing below `minHumans`,
 * 50 % at `minHumans`, rising linearly to 100 % at `fullHumans`. Blocks two-account farming.
 */
export function rankedRewardScaleBps(humans: number, minHumans: number, fullHumans: number): number {
  if (humans < minHumans) return 0;
  if (humans >= fullHumans || fullHumans <= minHumans) return BPS;
  return Math.round(BPS / 2 + (BPS / 2) * ((humans - minHumans) / (fullHumans - minHumans)));
}

/** Diminishing PvP reward for repeat kills of the same victim today: decay^(prior kills). */
export function repeatKillScaleBps(priorKillsToday: number, decayBps: number): number {
  const n = Math.max(0, Math.floor(priorKillsToday));
  return Math.round(BPS * Math.pow(Math.max(0, Math.min(BPS, decayBps)) / BPS, n));
}

/**
 * Splits a boss reward by damage share. Only contributors with at least `minShareBps` of the total
 * damage qualify; shares are of the total (small contributors' part is simply not paid out).
 */
export function damageShares(damageBy: ReadonlyMap<string, number>, minShareBps: number): { id: string; shareBps: number }[] {
  let total = 0;
  for (const d of damageBy.values()) if (d > 0) total += d;
  if (total <= 0) return [];
  const out: { id: string; shareBps: number }[] = [];
  for (const [id, d] of damageBy) {
    if (d <= 0) continue;
    const shareBps = Math.floor((d / total) * BPS);
    if (shareBps >= minShareBps) out.push({ id, shareBps });
  }
  return out;
}

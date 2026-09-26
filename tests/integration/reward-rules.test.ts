import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Persistence } from "../../apps/game-server/src/persistence";
import { ctx, makeUser } from "./helpers";

const c = ctx();
const persistence = new Persistence(c.prisma, c.config, c.logger);
const tag = (): string => randomBytes(4).toString("hex");

afterAll(async () => {
  await c.prisma.$disconnect();
});

describe("game-server reward rules (DB-backed)", () => {
  it("halves PvP kill rewards for repeat kills of the same victim today", async () => {
    const { user: killer } = await makeUser(c);
    const { user: victim } = await makeUser(c);
    const { user: other } = await makeUser(c);
    const kill = (v: string, n: number) =>
      persistence.rewardPvpKill(
        { userId: killer.id, source: "KILL", asset: "CRYPTO", baseAmount: 200_000n, idempotencyKey: `kill:${killer.id}:${v}:${tag()}:${n}` },
        v,
        5_000,
      );
    const amounts = [];
    for (let i = 0; i < 3; i++) amounts.push((await kill(victim.id, i)).amount);
    expect(amounts).toEqual([200_000n, 100_000n, 50_000n]);
    // A different victim starts from full value again.
    expect((await kill(other.id, 0)).amount).toBe(200_000n);
  });

  it("splits nothing past the daily boss-reward limit", async () => {
    const { user } = await makeUser(c);
    const boss = () =>
      persistence.rewardBoss({ userId: user.id, source: "EVENT", asset: "CRYPTO", baseAmount: 1_000_000n, performanceBps: 5_000, idempotencyKey: `titan:${user.id}:${tag()}:npc` }, 2);
    const r1 = await boss();
    const r2 = await boss();
    const r3 = await boss();
    expect(r1?.amount).toBe(500_000n); // 50 % damage share
    expect(r2?.amount).toBe(500_000n);
    expect(r3).toBeNull(); // limit of 2 per day reached
  });
});

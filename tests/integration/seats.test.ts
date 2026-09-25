import { afterAll, describe, expect, it } from "vitest";
import { Persistence } from "../../apps/game-server/src/persistence";
import { ctx, makeUser } from "./helpers";

const c = ctx();
const persistence = new Persistence(c.prisma, c.config, c.logger);

afterAll(async () => {
  await c.prisma.$disconnect();
});

describe("game seat lease (one live character per account across processes)", () => {
  it("lets only one room hold a user's seat until it is released", async () => {
    const { user } = await makeUser(c);
    const [a, b] = await Promise.all([persistence.claimSeat(user.id, "room-a", 45_000), persistence.claimSeat(user.id, "room-b", 45_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const holder = a ? "room-a" : "room-b";
    const other = a ? "room-b" : "room-a";

    expect(await persistence.claimSeat(user.id, other, 45_000)).toBe(false);
    await persistence.releaseSeats(other, user.id); // not the holder: no effect
    expect(await persistence.claimSeat(user.id, other, 45_000)).toBe(false);

    await persistence.releaseSeats(holder, user.id);
    expect(await persistence.claimSeat(user.id, other, 45_000)).toBe(true);
  });

  it("allows taking over an expired lease, and renewal keeps it alive", async () => {
    const { user } = await makeUser(c);
    expect(await persistence.claimSeat(user.id, "room-a", 45_000)).toBe(true);
    await c.prisma.gameSeat.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await persistence.renewSeats("room-a", [user.id], 45_000);
    expect(await persistence.claimSeat(user.id, "room-b", 45_000)).toBe(false);

    await c.prisma.gameSeat.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await persistence.claimSeat(user.id, "room-b", 45_000)).toBe(true);
    await persistence.releaseSeats("room-b");
    expect(await c.prisma.gameSeat.count({ where: { userId: user.id } })).toBe(0);
  });
});

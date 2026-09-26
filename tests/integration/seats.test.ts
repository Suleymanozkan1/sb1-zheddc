import { afterAll, describe, expect, it } from "vitest";
import { Persistence } from "../../apps/game-server/src/persistence";
import { ctx, makeUser } from "./helpers";

const c = ctx();
const persistence = new Persistence(c.prisma, c.config, c.logger);

afterAll(async () => {
  await c.prisma.$disconnect();
});

async function expire(userId: string): Promise<void> {
  await c.prisma.gameSeat.update({ where: { userId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
}

describe("game seat lease (one live character per account across processes)", () => {
  it("lets only one room hold a user's seat until it is released", async () => {
    const { user } = await makeUser(c);
    const [a, b] = await Promise.all([persistence.claimSeat(user.id, "room-a", 45_000), persistence.claimSeat(user.id, "room-b", 45_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const token = (a ?? b)!;
    const other = a ? "room-b" : "room-a";

    expect(await persistence.claimSeat(user.id, other, 45_000)).toBeNull();
    // Same room cannot re-claim either while the lease is live (no same-room shortcut).
    expect(await persistence.claimSeat(user.id, a ? "room-a" : "room-b", 45_000)).toBeNull();

    await persistence.releaseSeat(user.id, "00000000-0000-4000-8000-000000000000"); // wrong token: no effect
    expect(await persistence.claimSeat(user.id, other, 45_000)).toBeNull();

    await persistence.releaseSeat(user.id, token);
    expect(await persistence.claimSeat(user.id, other, 45_000)).toBeTruthy();
  });

  it("renews only leases with a matching token and reports lost ones after a takeover", async () => {
    const { user } = await makeUser(c);
    const first = await persistence.claimSeat(user.id, "room-a", 45_000);
    expect(first).toBeTruthy();
    expect(await persistence.renewSeats("room-a", [{ userId: user.id, token: first! }], 45_000)).toEqual(new Set([user.id]));

    // Expired lease is taken over by room-b: room-a's renewal must report it lost.
    await expire(user.id);
    const second = await persistence.claimSeat(user.id, "room-b", 45_000);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect((await persistence.renewSeats("room-a", [{ userId: user.id, token: first! }], 45_000)).size).toBe(0);
    expect(await c.prisma.gameSeat.findUnique({ where: { userId: user.id } })).toMatchObject({ roomId: "room-b", token: second });
  });

  it("a stale release never deletes a newer lease (rapid leave + rejoin)", async () => {
    const { user } = await makeUser(c);
    const old = await persistence.claimSeat(user.id, "room-a", 45_000);
    await expire(user.id);
    const fresh = await persistence.claimSeat(user.id, "room-a", 45_000); // rejoin, same room
    expect(fresh).toBeTruthy();
    await persistence.releaseSeat(user.id, old!); // delayed cleanup of the previous session
    expect(await c.prisma.gameSeat.findUnique({ where: { userId: user.id } })).toMatchObject({ token: fresh });

    await persistence.releaseRoomSeats("room-a");
    expect(await c.prisma.gameSeat.count({ where: { userId: user.id } })).toBe(0);
  });
});

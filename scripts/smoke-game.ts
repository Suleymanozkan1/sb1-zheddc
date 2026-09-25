// End-to-end smoke test: guest login → game ticket → join arena → move/attack → verify state sync.
// Usage: pnpm tsx scripts/smoke-game.ts  (API on :3000 and game server on :2567 must be running)
import { Callbacks, Client } from "@colyseus/sdk";

const API = process.env.API_URL ?? "http://localhost:3000";
const GAME = process.env.GAME_URL ?? "ws://localhost:2567";

async function main(): Promise<void> {
  const login = await fetch(`${API}/api/auth/guest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = /ca_csrf=([^;]+)/.exec(cookies)?.[1] ?? "";
  const me = (await login.json()) as { username: string };
  const chars = (await (await fetch(`${API}/api/characters`, { headers: { cookie: cookies } })).json()) as { key: string; progress: { userCharacterId: string } | null }[];
  const owned = chars.find((c) => c.progress)!;
  const ticketRes = await fetch(`${API}/api/game/ticket`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf },
    body: JSON.stringify({ userCharacterId: owned.progress!.userCharacterId, mode: "CASUAL" }),
  });
  const { ticket } = (await ticketRes.json()) as { ticket: string };
  console.log("logged in as", me.username, "playing", owned.key);

  const client = new Client(GAME);
  const room = await client.joinOrCreate("arena_casual", { ticket });
  const events: Record<string, number> = {};
  room.onMessage("*", (type) => {
    events[String(type)] = (events[String(type)] ?? 0) + 1;
  });
  const cb = Callbacks.get(room);
  let players = 0;
  let npcs = 0;
  cb.onAdd("players", () => players++);
  cb.onAdd("npcs", () => npcs++);

  // Replaying the same ticket must fail.
  try {
    await new Client(GAME).joinOrCreate("arena_casual", { ticket });
    console.error("FAIL: ticket replay accepted");
    process.exitCode = 1;
  } catch {
    console.log("ok: ticket replay rejected");
  }

  await new Promise((r) => setTimeout(r, 500));
  const state = room.state as unknown as { players: Map<string, { x: number; y: number; ack: number }> };
  const start = state.players.get(room.sessionId)!;
  const sx = start.x;
  const sy = start.y;
  for (let seq = 1; seq <= 120; seq++) {
    room.send("player_move", { seq, mx: 50, my: 0, aim: 0, buttons: seq % 20 === 0 ? 1 : 0 }); // mx=50 must be clamped to 1
    await new Promise((r) => setTimeout(r, 1000 / 60));
  }
  await new Promise((r) => setTimeout(r, 400));
  const end = state.players.get(room.sessionId)!;
  const moved = Math.hypot(end.x - sx, end.y - sy);
  console.log({ moved: Math.round(moved), ack: end.ack, players, npcs, events });
  if (moved > 700) {
    console.error("FAIL: impossible movement accepted");
    process.exitCode = 1;
  }
  if (end.ack < 100) {
    console.error("FAIL: inputs not acknowledged");
    process.exitCode = 1;
  }
  await room.leave();
  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

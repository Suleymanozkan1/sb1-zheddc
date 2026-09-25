import { createHash } from "node:crypto";
import { MockSolanaGateway } from "@cryptoarena/blockchain";
import type { FastifyInstance } from "fastify";
import { generateKeyPairSigner, getBase58Decoder, getUtf8Encoder, signBytes } from "@solana/kit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/app";
import { ctx } from "./helpers";

let app: FastifyInstance;
const c = ctx();

function cookies(res: { cookies: { name: string; value: string }[] }): { header: string; csrf: string } {
  const map = new Map(res.cookies.map((x) => [x.name, x.value]));
  return { header: [...map].map(([k, v]) => `${k}=${v}`).join("; "), csrf: map.get("ca_csrf") ?? "" };
}

beforeAll(async () => {
  app = await buildApp({ ...c, gateway: new MockSolanaGateway("devnet"), redis: null });
});
afterAll(async () => {
  await app.close();
});

describe("REST API", () => {
  it("serves health and readiness", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/ready" })).json()).toMatchObject({ status: "ready" });
  });

  it("wallet login: valid signature succeeds, replayed nonce and bad signature fail", async () => {
    const signer = await generateKeyPairSigner();
    const nonceRes = await app.inject({ method: "POST", url: "/api/auth/nonce", payload: { address: signer.address } });
    const { nonce, message } = nonceRes.json<{ nonce: string; message: string }>();
    const sig = getBase58Decoder().decode(await signBytes(signer.keyPair.privateKey, getUtf8Encoder().encode(message)));

    const bad = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { address: signer.address, nonce, signature: getBase58Decoder().decode(new Uint8Array(64)) } });
    expect(bad.statusCode).toBe(401);
    // The invalid attempt consumed the nonce, so even the valid signature for it is now rejected.
    const afterBad = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { address: signer.address, nonce, signature: sig } });
    expect(afterBad.statusCode).toBe(401);

    const nonce2 = (await app.inject({ method: "POST", url: "/api/auth/nonce", payload: { address: signer.address } })).json<{ nonce: string; message: string }>();
    const sig2 = getBase58Decoder().decode(await signBytes(signer.keyPair.privateKey, getUtf8Encoder().encode(nonce2.message)));
    const ok = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { address: signer.address, nonce: nonce2.nonce, signature: sig2 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ isGuest: false, wallets: [{ address: signer.address }] });

    const replay = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { address: signer.address, nonce: nonce2.nonce, signature: sig2 } });
    expect(replay.statusCode).toBe(401);
  });

  it("binds wallet-link nonces to the account that requested them", async () => {
    const signer = await generateKeyPairSigner();
    const a = cookies(await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} }));
    const b = cookies(await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} }));
    const issued = await app.inject({ method: "POST", url: "/api/auth/nonce", headers: { cookie: a.header, "x-csrf-token": a.csrf }, payload: { address: signer.address, purpose: "LINK_WALLET" } });
    expect(issued.statusCode).toBe(200);
    const { nonce, message } = issued.json<{ nonce: string; message: string }>();
    const signature = getBase58Decoder().decode(await signBytes(signer.keyPair.privateKey, getUtf8Encoder().encode(message)));
    const payload = { address: signer.address, nonce, signature };

    const stolen = await app.inject({ method: "POST", url: "/api/wallet/connect", headers: { cookie: b.header, "x-csrf-token": b.csrf }, payload });
    expect(stolen.statusCode).toBe(401);
    const own = await app.inject({ method: "POST", url: "/api/wallet/connect", headers: { cookie: a.header, "x-csrf-token": a.csrf }, payload });
    expect(own.statusCode).toBe(200);
  });

  it("requires authentication and CSRF tokens for state changes", async () => {
    expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} });
    const { header, csrf } = cookies(login);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: header } })).statusCode).toBe(200);
    const noCsrf = await app.inject({ method: "POST", url: "/api/shop/purchase", headers: { cookie: header }, payload: { sku: "potion_pack_5", idempotencyKey: "abcdefgh1" } });
    expect(noCsrf.statusCode).toBe(403);
    const withCsrf = await app.inject({ method: "POST", url: "/api/shop/purchase", headers: { cookie: header, "x-csrf-token": csrf }, payload: { sku: "potion_pack_5", idempotencyKey: "abcdefgh2" } });
    expect(withCsrf.statusCode).toBe(200);
  });

  it("validates input with schemas (invalid purchase body)", async () => {
    const { header, csrf } = cookies(await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} }));
    const res = await app.inject({ method: "POST", url: "/api/shop/purchase", headers: { cookie: header, "x-csrf-token": csrf }, payload: { sku: "'; DROP TABLE users;--", quantity: -1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  it("forbids admin endpoints for regular users and allows them for admins (unauthorized admin)", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} });
    const { header, csrf } = cookies(login);
    const userId = login.json<{ id: string }>().id;
    expect((await app.inject({ method: "GET", url: "/api/admin/overview", headers: { cookie: header } })).statusCode).toBe(403);

    await c.prisma.adminUser.create({ data: { userId, role: "SUPPORT" } });
    expect((await app.inject({ method: "GET", url: "/api/admin/overview", headers: { cookie: header } })).statusCode).toBe(200);
    // SUPPORT may read but not adjust balances.
    const adjust = await app.inject({
      method: "POST",
      url: "/api/admin/balance/adjust",
      headers: { cookie: header, "x-csrf-token": csrf },
      payload: { userId, account: "GOLD", delta: "100", reason: "testing roles", requestId: "req123456" },
    });
    expect(adjust.statusCode).toBe(403);
  });

  it("issues single-use game tickets only for owned characters", async () => {
    const { header, csrf } = cookies(await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} }));
    const chars = (await app.inject({ method: "GET", url: "/api/characters", headers: { cookie: header } })).json<{ key: string; progress: { userCharacterId: string } | null }[]>();
    const owned = chars.find((x) => x.progress)!;
    const ok = await app.inject({ method: "POST", url: "/api/game/ticket", headers: { cookie: header, "x-csrf-token": csrf }, payload: { userCharacterId: owned.progress!.userCharacterId, mode: "CASUAL" } });
    expect(ok.statusCode).toBe(200);
    const foreign = await app.inject({ method: "POST", url: "/api/game/ticket", headers: { cookie: header, "x-csrf-token": csrf }, payload: { userCharacterId: "00000000-0000-4000-8000-000000000000", mode: "CASUAL" } });
    expect(foreign.statusCode).toBe(404);
  });

  it("does not revoke the session family when two tabs refresh at the same time", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} });
    const rt = login.cookies.find((x) => x.name === "ca_rt")!.value;
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rt}` }, payload: {} }),
      app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rt}` }, payload: {} }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? a : b;
    const loser = winner === a ? b : a;
    // The losing response must not clear the cookies the winner just set.
    expect(loser.cookies).toHaveLength(0);
    const rotated = winner.cookies.find((x) => x.name === "ca_rt")!.value;
    // The winner's new token keeps working: the losing tab did not trigger theft protection.
    expect((await app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rotated}` }, payload: {} })).statusCode).toBe(200);
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/guest", payload: {} });
    const rt = login.cookies.find((x) => x.name === "ca_rt")!.value;
    const first = await app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rt}` }, payload: {} });
    expect(first.statusCode).toBe(200);
    // Replay the old token after the benign-race grace window (e.g. a stolen cookie used later).
    const hash = createHash("sha256").update(rt).digest("hex");
    await c.prisma.session.update({ where: { refreshTokenHash: hash }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const reuse = await app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rt}` }, payload: {} });
    expect(reuse.statusCode).toBe(401);
    const rotated = first.cookies.find((x) => x.name === "ca_rt")!.value;
    const afterReuse = await app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `ca_rt=${rotated}` }, payload: {} });
    expect(afterReuse.statusCode).toBe(401);
  });
});

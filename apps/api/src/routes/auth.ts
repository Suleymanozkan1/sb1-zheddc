import { randomBytes } from "node:crypto";
import { buildSignInMessage, verifyWalletSignature } from "@cryptoarena/blockchain";
import { withTransaction, type Tx } from "@cryptoarena/database";
import { AppError, createUser, writeAudit } from "@cryptoarena/economy";
import { LogEvent } from "@cryptoarena/observability";
import { nonceRequest, verifyRequest } from "@cryptoarena/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { COOKIE_REFRESH, clearSessionCookies, setSessionCookies } from "../auth";
import type { ApiContext } from "../context";
import { clientCountry, parseBody } from "../http";
import { buildMe } from "../me";
import { createSession, sha256 } from "../tokens";

const NONCE_TTL_MS = 5 * 60_000;

function meta(req: FastifyRequest) {
  const ua = req.headers["user-agent"];
  return { userAgent: typeof ua === "string" ? ua : null, ip: req.ip };
}

/** Domain shown in the sign-in message: the calling origin if it is allow-listed, else the primary web origin. */
export function domainFor(ctx: ApiContext, req?: FastifyRequest): string {
  const origin = req?.headers.origin;
  const candidate = origin && ctx.config.webOrigins.includes(origin) ? origin : (ctx.config.webOrigins[0] ?? "http://localhost");
  try {
    return new URL(candidate).host;
  } catch {
    return "cryptoarena";
  }
}

/** Atomically consumes a nonce: a signature can never be replayed. */
/** Consumes a single-use nonce. Link nonces are bound to the account that requested them (`forUserId`). */
export async function consumeNonce(tx: Tx, address: string, nonce: string, purpose: "LOGIN" | "LINK_WALLET", forUserId: string | null = null): Promise<string> {
  const row = await tx.walletNonce.findUnique({ where: { nonce } });
  if (!row || row.address !== address || row.purpose !== purpose) throw new AppError("NONCE_EXPIRED", "Unknown or mismatched nonce");
  if (purpose === "LINK_WALLET" && (!forUserId || row.userId !== forUserId)) throw new AppError("NONCE_EXPIRED", "Unknown or mismatched nonce");
  const used = await tx.walletNonce.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new AppError("NONCE_EXPIRED", "Nonce expired or already used");
  return row.message;
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const strict = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.post("/api/auth/nonce", strict, async (req) => {
    const body = parseBody(nonceRequest, req);
    if (body.purpose === "LINK_WALLET" && !req.auth) throw new AppError("UNAUTHORIZED", "Sign in to link a wallet");
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
    const message = buildSignInMessage({ domain: domainFor(ctx, req), address: body.address, nonce, issuedAt, expiresAt, purpose: body.purpose === "LOGIN" ? "Sign in to CryptoArena" : "Link wallet to your CryptoArena account" });
    await ctx.prisma.walletNonce.create({ data: { address: body.address, nonce, message, purpose: body.purpose, userId: req.auth?.id ?? null, expiresAt } });
    return { nonce, message, expiresAt: expiresAt.toISOString() };
  });

  app.post("/api/auth/verify", strict, async (req, reply) => {
    const body = parseBody(verifyRequest, req);
    const country = clientCountry(req, ctx.config.GEO_COUNTRY_HEADER);
    // The nonce is burned in its own transaction so a failed signature check cannot be retried with it.
    const message = await withTransaction(ctx.prisma, (tx) => consumeNonce(tx, body.address, body.nonce, "LOGIN"));
    if (!(await verifyWalletSignature(body.address, message, body.signature))) throw new AppError("INVALID_SIGNATURE", "Wallet signature is invalid");
    const result = await withTransaction(ctx.prisma, async (tx) => {

      let wallet = await tx.wallet.findUnique({ where: { address: body.address }, include: { user: true } });
      let userId: string;
      if (wallet) {
        userId = wallet.userId;
      } else if (req.auth?.isGuest) {
        // Upgrade the current guest account: progress is kept, the wallet becomes its login.
        userId = req.auth.id;
        await tx.user.update({ where: { id: userId }, data: { isGuest: false } });
        wallet = await tx.wallet.create({ data: { userId, address: body.address, verifiedAt: new Date(), isPrimary: true }, include: { user: true } });
      } else {
        const user = await createUser(tx, { isGuest: false, countryCode: country });
        userId = user.id;
        wallet = await tx.wallet.create({ data: { userId, address: body.address, verifiedAt: new Date(), isPrimary: true }, include: { user: true } });
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.status === "BANNED") throw new AppError("ACCOUNT_RESTRICTED", "This account is banned");
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), ...(country && !user.countryCode ? { countryCode: country } : {}) } });
      await writeAudit(tx, { actorType: "USER", userId, action: "USER_LOGIN", targetType: "Wallet", targetId: wallet.id, ip: req.ip });
      const session = await createSession(tx, ctx.config, userId, meta(req));
      return { userId, session };
    });
    setSessionCookies(ctx, reply, result.session);
    ctx.logger.info({ event: LogEvent.USER_LOGIN, userId: result.userId, method: "wallet" }, "user login");
    return buildMe(ctx, result.userId);
  });

  app.post("/api/auth/guest", strict, async (req, reply) => {
    if (!ctx.config.ALLOW_GUESTS) throw new AppError("FORBIDDEN", "Guest accounts are disabled");
    if (req.auth) return buildMe(ctx, req.auth.id);
    const country = clientCountry(req, ctx.config.GEO_COUNTRY_HEADER);
    const result = await withTransaction(ctx.prisma, async (tx) => {
      const user = await createUser(tx, { isGuest: true, countryCode: country });
      const session = await createSession(tx, ctx.config, user.id, meta(req));
      return { userId: user.id, session };
    });
    setSessionCookies(ctx, reply, result.session);
    ctx.logger.info({ event: LogEvent.USER_LOGIN, userId: result.userId, method: "guest" }, "guest login");
    return buildMe(ctx, result.userId);
  });

  app.post("/api/auth/refresh", strict, async (req, reply) => {
    const token = req.cookies[COOKIE_REFRESH];
    if (!token) throw new AppError("UNAUTHORIZED", "No refresh token");
    const outcome = await withTransaction(ctx.prisma, async (tx) => {
      const hash = sha256(token);
      // Lock the row so two concurrent refreshes with the same token cannot both rotate it.
      await tx.$queryRaw`SELECT id FROM "Session" WHERE "refreshTokenHash" = ${hash} FOR UPDATE`;
      const session = await tx.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
      if (!session) return { ok: false as const };
      if (session.revokedAt) {
        // Benign race: another tab rotated this token moments ago — reject without revoking the family.
        if (session.replacedById && Date.now() - session.revokedAt.getTime() < 30_000) return { ok: false as const };
        // Reuse of a rotated token → assume theft, revoke the whole family.
        await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return { ok: false as const, reuse: true };
      }
      if (session.expiresAt < new Date() || session.user.status === "BANNED") return { ok: false as const };
      const next = await createSession(tx, ctx.config, session.userId, meta(req), session.familyId);
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), replacedById: next.sessionId } });
      return { ok: true as const, userId: session.userId, next };
    });
    if (!outcome.ok) {
      clearSessionCookies(ctx, reply);
      if ("reuse" in outcome && outcome.reuse) ctx.logger.warn({ ip: req.ip }, "refresh token reuse detected; session family revoked");
      throw new AppError("UNAUTHORIZED", "Session expired");
    }
    setSessionCookies(ctx, reply, outcome.next);
    return buildMe(ctx, outcome.userId);
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.auth) {
      const s = await ctx.prisma.session.findUnique({ where: { id: req.auth.sessionId } });
      if (s) await ctx.prisma.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      ctx.logger.info({ event: LogEvent.USER_LOGOUT, userId: req.auth.id }, "user logout");
    }
    clearSessionCookies(ctx, reply);
    return { ok: true };
  });
}

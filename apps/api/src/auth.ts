import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AdminRole } from "@cryptoarena/database";
import { AppError, hasRole } from "@cryptoarena/economy";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiContext } from "./context";
import { verifyAccessToken, type IssuedSession } from "./tokens";

export const COOKIE_ACCESS = "ca_at";
export const COOKIE_REFRESH = "ca_rt";
export const COOKIE_CSRF = "ca_csrf";

export interface AuthUser {
  id: string;
  sessionId: string;
  username: string;
  isGuest: boolean;
  adminRole: AdminRole | null;
  adminUserId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}

function cookieBase(ctx: ApiContext) {
  return {
    secure: ctx.config.isProduction,
    sameSite: "lax" as const,
    ...(ctx.config.COOKIE_DOMAIN ? { domain: ctx.config.COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookies(ctx: ApiContext, reply: FastifyReply, s: IssuedSession): void {
  const base = cookieBase(ctx);
  reply.setCookie(COOKIE_ACCESS, s.accessToken, { ...base, httpOnly: true, path: "/", maxAge: ctx.config.ACCESS_TOKEN_TTL_SECONDS });
  reply.setCookie(COOKIE_REFRESH, s.refreshToken, { ...base, httpOnly: true, path: "/api/auth", expires: s.refreshExpiresAt });
  // Double-submit CSRF token: readable by our JS, must be echoed in the x-csrf-token header.
  reply.setCookie(COOKIE_CSRF, randomBytes(24).toString("base64url"), { ...base, httpOnly: false, path: "/", expires: s.refreshExpiresAt });
}

export function clearSessionCookies(ctx: ApiContext, reply: FastifyReply): void {
  const base = cookieBase(ctx);
  reply.clearCookie(COOKIE_ACCESS, { ...base, path: "/" });
  reply.clearCookie(COOKIE_REFRESH, { ...base, path: "/api/auth" });
  reply.clearCookie(COOKIE_CSRF, { ...base, path: "/" });
}

/** Resolves the session from the access cookie (or `Authorization: Bearer` for non-browser clients). */
export async function authenticate(ctx: ApiContext, req: FastifyRequest): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  const token = req.cookies[COOKIE_ACCESS] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return null;
  const claims = await verifyAccessToken(ctx.config, token);
  if (!claims) return null;
  const session = await ctx.prisma.session.findUnique({
    where: { id: claims.sid },
    select: { revokedAt: true, userId: true, user: { select: { id: true, username: true, isGuest: true, status: true, admin: true } } },
  });
  if (!session || session.revokedAt || session.userId !== claims.sub) return null;
  if (session.user.status === "BANNED") return null;
  const admin = session.user.admin && session.user.admin.active ? session.user.admin : null;
  return {
    id: session.user.id,
    sessionId: claims.sid,
    username: session.user.username,
    isGuest: session.user.isGuest,
    adminRole: admin?.role ?? null,
    adminUserId: admin?.id ?? null,
  };
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Sign in required");
  return req.auth;
}

export function requireAdmin(req: FastifyRequest, min: AdminRole): AuthUser & { adminRole: AdminRole; adminUserId: string } {
  const user = requireUser(req);
  if (!user.adminRole || !user.adminUserId || !hasRole(user.adminRole, min)) throw new AppError("FORBIDDEN", "Insufficient admin permissions");
  return user as AuthUser & { adminRole: AdminRole; adminUserId: string };
}

const CSRF_EXEMPT = new Set(["/api/auth/nonce", "/api/auth/verify", "/api/auth/guest", "/api/auth/refresh"]);

/** Double-submit cookie check for state-changing requests authenticated by cookies. */
export function checkCsrf(req: FastifyRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const path = req.url.split("?")[0] ?? "";
  if (!path.startsWith("/api/") || CSRF_EXEMPT.has(path)) return;
  // Bearer-token clients are not vulnerable to CSRF.
  if (req.headers.authorization?.startsWith("Bearer ") && !req.cookies[COOKIE_ACCESS]) return;
  const cookie = req.cookies[COOKIE_CSRF];
  const header = req.headers["x-csrf-token"];
  const h = Array.isArray(header) ? header[0] : header;
  if (!cookie || !h || cookie.length !== h.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(h))) {
    throw new AppError("FORBIDDEN", "CSRF token missing or invalid");
  }
}

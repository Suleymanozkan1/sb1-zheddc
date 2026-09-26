// Session tokens.
//  - access token: short-lived HS256 JWT in an HttpOnly cookie (aud "api")
//  - refresh token: random 48 bytes in an HttpOnly cookie scoped to /api/auth; stored hashed,
//    rotated on every use; reuse of a rotated token revokes the whole session family
//  - game ticket: 60s single-use JWT (aud "game") handed to the Colyseus server

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppConfig } from "@cryptoarena/config";
import type { Tx } from "@cryptoarena/database";
import type { GameTicketClaims } from "@cryptoarena/shared";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "cryptoarena";

function key(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export interface AccessClaims {
  sub: string;
  sid: string;
}

export async function signAccessToken(config: AppConfig, claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience("api")
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key(config));
}

export async function verifyAccessToken(config: AppConfig, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(config), { issuer: ISSUER, audience: "api", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

export async function signGameTicket(config: AppConfig, claims: GameTicketClaims): Promise<string> {
  return new SignJWT({ uc: claims.uc, mode: claims.mode, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience("game")
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.GAME_TICKET_TTL_SECONDS}s`)
    .sign(key(config));
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export async function createSession(
  tx: Tx,
  config: AppConfig,
  userId: string,
  meta: { userAgent: string | null; ip: string | null },
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const refreshToken = randomBytes(48).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await tx.session.create({
    data: { userId, familyId, refreshTokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null, ip: meta.ip },
  });
  const accessToken = await signAccessToken(config, { sub: userId, sid: session.id });
  return { sessionId: session.id, accessToken, refreshToken, refreshExpiresAt };
}


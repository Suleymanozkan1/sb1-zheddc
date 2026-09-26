import type { GameTicketClaims, MatchMode } from "@cryptoarena/shared";
import { jwtVerify } from "jose";

/** Remembers ticket ids until they expire so a ticket can only be used once. */
export class TicketVerifier {
  private readonly secret: Uint8Array;
  private readonly used = new Map<string, number>();

  constructor(jwtSecret: string) {
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  async verify(ticket: unknown, expectedMode: MatchMode): Promise<GameTicketClaims | null> {
    if (typeof ticket !== "string" || ticket.length > 2048) return null;
    try {
      const { payload } = await jwtVerify(ticket, this.secret, { issuer: "cryptoarena", audience: "game", algorithms: ["HS256"] });
      const jti = payload.jti;
      const exp = payload.exp;
      if (!jti || !exp || typeof payload.sub !== "string") return null;
      if (payload.mode !== expectedMode || typeof payload.uc !== "string" || typeof payload.name !== "string") return null;
      this.gc();
      if (this.used.has(jti)) return null; // replay
      this.used.set(jti, exp * 1000);
      return { sub: payload.sub, uc: payload.uc, mode: expectedMode, name: payload.name };
    } catch {
      return null;
    }
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k);
  }
}

import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAMES, type ClientMessages, type MatchMode, type ServerMessages } from "@cryptoarena/shared";
import type { ArenaStateView } from "./types";

const GAME_URL = (import.meta.env.VITE_GAME_URL as string | undefined) ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

type Handler<K extends keyof ServerMessages> = (msg: ServerMessages[K]) => void;

/** Thin typed wrapper around a Colyseus room plus clock synchronisation. */
export class GameConnection {
  readonly room: Room<unknown, ArenaStateView>;
  /** serverTime ≈ performance.now() + offset */
  private offset = 0;
  rtt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Map<string, ((msg: unknown) => void)[]>();
  /** Messages that arrived before a handler was registered (e.g. before Phaser booted). */
  private readonly early: { type: string; msg: unknown }[] = [];

  private constructor(room: Room<unknown, ArenaStateView>) {
    this.room = room;
    // One wildcard subscription; handlers are dispatched locally so nothing is lost while the scene loads.
    this.room.onMessage("*", (type: string | number, msg: unknown) => {
      const handlers = this.listeners.get(String(type));
      if (handlers && handlers.length > 0) for (const h of handlers) h(msg);
      else if (this.early.length < 200) this.early.push({ type: String(type), msg });
    });
    this.on("pong", (m) => {
      const now = performance.now();
      this.rtt = now - m.t;
      const estimate = m.serverTime + this.rtt / 2 - now;
      this.offset = this.offset === 0 ? estimate : this.offset * 0.8 + estimate * 0.2;
    });
    this.on("welcome", (m) => {
      if (this.offset === 0) this.offset = m.serverTime - performance.now();
    });
    this.pingTimer = setInterval(() => this.send("ping", { t: performance.now() }), 2000);
    this.send("ping", { t: performance.now() });
  }

  static async join(ticket: string, mode: MatchMode): Promise<GameConnection> {
    const client = new Client(GAME_URL);
    const room = await client.joinOrCreate<ArenaStateView>(ROOM_NAMES[mode], { ticket });
    return new GameConnection(room as unknown as Room<unknown, ArenaStateView>);
  }

  get state(): ArenaStateView {
    return this.room.state;
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  serverNow(): number {
    return performance.now() + this.offset;
  }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]): void {
    (this.room.send as (t: string, m: unknown) => void)(type, payload);
  }

  on<K extends keyof ServerMessages>(type: K, handler: Handler<K>): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler as (m: unknown) => void);
    this.listeners.set(type, list);
    for (let i = 0; i < this.early.length; i++) {
      const e = this.early[i]!;
      if (e.type === type) {
        this.early.splice(i--, 1);
        (handler as (m: unknown) => void)(e.msg);
      }
    }
  }

  async leave(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      await this.room.leave(true);
    } catch {
      /* already closed */
    }
  }
}

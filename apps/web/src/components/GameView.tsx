import { Button, Spinner } from "@cryptoarena/ui";
import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { ArenaScene } from "../game/ArenaScene";
import { useHud } from "../game/hud";
import type { TouchInput } from "../game/input";
import { GameConnection } from "../game/net";
import { api } from "../lib/api";
import { errorMessage, useApp } from "../lib/store";
import { Hud } from "./Hud";

/**
 * Joins and leaves run one at a time. The server allows one seat per user, so a remount
 * (React StrictMode, fast navigation) must finish leaving before the next join starts.
 */
let sessionChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = sessionChain.then(fn);
  sessionChain = run.catch(() => undefined);
  return run;
}

export function GameView() {
  const { selectedCharacterId, mode, go, setBalances } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [touch, setTouch] = useState<TouchInput | null>(null);
  const [ready, setReady] = useState(false);
  const connRef = useRef<GameConnection | null>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;
    useHud.getState().reset();

    (async () => {
      if (!selectedCharacterId) throw new Error("Select a character first");
      const conn = await serial(async () => {
        if (cancelled) return null;
        const { ticket } = await api.gameTicket(selectedCharacterId, mode);
        const joined = await GameConnection.join(ticket, mode);
        if (cancelled) {
          await joined.leave();
          return null;
        }
        return joined;
      });
      if (!conn) return;
      connRef.current = conn;
      conn.room.onLeave((code) => {
        // 4011: the server released this seat (session moved to another arena or could not be verified).
        if (code === 4011) useHud.getState().set({ error: "Your arena session ended because it could not be kept on this server. Please rejoin." });
        else if (code !== 1000 && code !== 4000) useHud.getState().set({ error: `Disconnected (${code})` });
      });
      // Wait for the first full state (map seed) before booting Phaser.
      await new Promise<void>((resolve) => {
        if (conn.state?.mapSeed) return resolve();
        conn.room.onStateChange.once(() => resolve());
      });
      // Canvas text needs the web fonts ready before it is rasterized.
      await Promise.race([document.fonts.load('700 12px "Orbitron"'), new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
      if (cancelled) return;
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: container.current!,
        backgroundColor: "#05060f",
        scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
        render: { antialias: true, powerPreference: "high-performance" },
        fps: { target: 60 },
        scene: [],
      });
      game.scene.add("arena", ArenaScene, true, { conn, touch: setTouch });
      // Development-only debugging handle (stripped from production builds).
      if (import.meta.env.DEV) (window as unknown as { __arena?: Phaser.Game }).__arena = game;
      setReady(true);
    })().catch((err: unknown) => setError(errorMessage(err)));

    return () => {
      cancelled = true;
      game?.destroy(true);
      const conn = connRef.current;
      connRef.current = null;
      if (conn) void serial(() => conn.leave());
    };
  }, [selectedCharacterId, mode]);

  const leave = async () => {
    const conn = connRef.current;
    connRef.current = null;
    if (conn) await serial(() => conn.leave());
    try {
      const me = await api.me();
      setBalances(me.balances);
    } catch {
      /* ignore */
    }
    go("dashboard");
  };

  const hudError = useHud((s) => s.error);

  return (
    <div className="fixed inset-0 bg-[#05060f]">
      <div ref={container} className="absolute inset-0" />
      {ready && <Hud onLeave={() => void leave()} touch={touch} />}
      {!ready && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-cyan-300">
          <Spinner />
          <span className="font-display tracking-widest">ENTERING ARENA…</span>
        </div>
      )}
      {(error || hudError) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70">
          <p className="max-w-md text-center text-rose-300">{error ?? hudError}</p>
          <Button onClick={() => go("dashboard")}>Back to menu</Button>
        </div>
      )}
    </div>
  );
}

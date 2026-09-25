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
      const { ticket } = await api.gameTicket(selectedCharacterId, mode);
      const conn = await GameConnection.join(ticket, mode);
      if (cancelled) {
        await conn.leave();
        return;
      }
      connRef.current = conn;
      conn.room.onLeave((code) => {
        if (code !== 1000 && code !== 4000) useHud.getState().set({ error: `Disconnected (${code})` });
      });
      // Wait for the first full state (map seed) before booting Phaser.
      await new Promise<void>((resolve) => {
        if (conn.state?.mapSeed) return resolve();
        conn.room.onStateChange.once(() => resolve());
      });
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
      void connRef.current?.leave();
      connRef.current = null;
    };
  }, [selectedCharacterId, mode]);

  const leave = async () => {
    await connRef.current?.leave();
    connRef.current = null;
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

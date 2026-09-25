import { generateArena } from "@cryptoarena/game-core";
import { Button, ProgressBar, cx } from "@cryptoarena/ui";
import { useEffect, useMemo, useRef } from "react";
import { useHud } from "../game/hud";
import type { TouchInput } from "../game/input";
import { useApp } from "../lib/store";

function Cooldown({ label, name, readyAt, now, color }: { label: string; name: string; readyAt: number; now: number; color: string }) {
  const remaining = Math.max(0, readyAt - now);
  return (
    <div className="glass flex w-20 flex-col items-center gap-0.5 p-2 text-center">
      <span className="font-display text-xs font-bold" style={{ color }}>
        {label}
      </span>
      <span className="truncate text-[10px] text-slate-300">{name}</span>
      <span className={cx("font-display text-sm", remaining > 0 ? "text-slate-400" : "text-lime-300")}>{remaining > 0 ? (remaining / 1000).toFixed(1) : "READY"}</span>
    </div>
  );
}

function Minimap() {
  const { minimap, worldSize, mapSeed } = useHud();
  const ref = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => (mapSeed ? generateArena(mapSeed, worldSize) : null), [mapSeed, worldSize]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !map) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = c.width / worldSize;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(5,6,15,0.85)";
    ctx.fillRect(0, 0, c.width, c.height);
    for (const z of map.zones) {
      ctx.fillStyle = z.kind === "safe" ? "rgba(56,189,248,0.5)" : z.kind === "healing" ? "rgba(74,222,128,0.35)" : "rgba(250,204,21,0.35)";
      ctx.beginPath();
      ctx.arc(z.x * s, z.y * s, Math.max(2, z.r * s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(168,85,247,0.4)";
    ctx.beginPath();
    ctx.arc((worldSize / 2) * s, (worldSize / 2) * s, 1400 * s, 0, Math.PI * 2);
    ctx.stroke();
    for (const d of minimap) {
      ctx.fillStyle = d.kind === "self" ? "#22d3ee" : d.kind === "player" ? "#fbbf24" : d.kind === "boss" ? "#f43f5e" : "rgba(248,113,113,0.7)";
      const r = d.kind === "self" ? 4 : d.kind === "boss" ? 5 : 2;
      ctx.beginPath();
      ctx.arc(d.x * s, d.y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [minimap, map, worldSize]);
  return <canvas ref={ref} width={180} height={180} className="glass h-[140px] w-[140px] md:h-[180px] md:w-[180px]" />;
}

export function Hud({ onLeave, touch }: { onLeave: () => void; touch: TouchInput | null }) {
  const h = useHud();
  const showFps = useApp((s) => s.settings.showFps);
  const self = h.self;
  const now = h.serverNow;
  const phaseLeft = h.phaseEndsAt > 0 ? Math.max(0, Math.ceil((h.phaseEndsAt - now) / 1000)) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Top-left: vitals */}
      <div className="absolute top-3 left-3 flex w-72 flex-col gap-2">
        <div className="glass p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display font-bold text-cyan-300">LV {h.level}</span>
            <span className="text-slate-300">
              {Math.round(h.hp)} / {h.maxHp} HP
            </span>
          </div>
          <ProgressBar value={h.hp} max={h.maxHp} color={h.hp / h.maxHp > 0.3 ? "#4ade80" : "#f43f5e"} className="mt-1 h-3" />
          <ProgressBar value={self?.xpIntoLevel ?? 0} max={self?.xpForNext ?? 1} color="#facc15" className="mt-1.5 h-1.5" />
          <div className="mt-2 flex justify-between text-[11px] text-slate-300">
            <span>🪙 +{self?.gold ?? 0}</span>
            <span>🧪 {self?.potions ?? 0}</span>
            <span>⚔ {h.kills}</span>
            <span>☠ {h.deaths}</span>
            <span>★ {h.score}</span>
          </div>
        </div>
        <div className="text-[11px] text-slate-400">{h.region}</div>
        {showFps && (
          <div className="text-[11px] text-slate-500">
            {h.fps} fps · {h.ping} ms
          </div>
        )}
      </div>

      {/* Top-center: phase */}
      {h.mode === "RANKED" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div className="glass px-4 py-2 text-center font-display text-sm">
            {h.phase === "waiting" && "Waiting for players…"}
            {h.phase === "countdown" && <span className="text-amber-300">Match starts in {phaseLeft}s</span>}
            {h.phase === "running" && (
              <span>
                RANKED · {Math.floor(phaseLeft / 60)}:{String(phaseLeft % 60).padStart(2, "0")}
              </span>
            )}
            {h.phase === "ended" && "Match over"}
          </div>
        </div>
      )}

      {/* Top-right: minimap + kill feed */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <Minimap />
        <ul className="flex w-72 flex-col gap-1 text-right text-xs">
          {h.killFeed.map((k) => (
            <li key={k.id} className="glass px-2 py-1">
              <span className="text-amber-300">{k.killerName}</span> <span className="text-slate-400">⚔</span> <span className={k.victimIsNpc ? "text-rose-300" : "text-cyan-200"}>{k.victimName}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Center notices */}
      <div className="absolute top-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        {h.notices.map((n) => (
          <div key={n.id} className="font-display text-sm font-bold drop-shadow" style={{ color: n.color, textShadow: `0 0 12px ${n.color}` }}>
            {n.text}
          </div>
        ))}
        {h.nearMerchant && <div className="glass px-3 py-1 text-xs text-sky-300">Merchant: press [B] to buy 5 potions</div>}
      </div>

      {/* Death overlay */}
      {!h.alive && h.connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-950/30">
          <div className="text-center">
            <h2 className="font-display text-4xl font-black text-rose-400">ELIMINATED</h2>
            <p className="mt-2 text-slate-300">Respawning in {Math.max(0, Math.ceil((h.respawnAt - now) / 1000))}s…</p>
          </div>
        </div>
      )}

      {/* Bottom: abilities */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {self && (
          <>
            <Cooldown label="LMB" name="Attack" readyAt={self.cooldowns.attack} now={now} color="#e2e8f0" />
            <Cooldown label="SPACE" name="Dash" readyAt={self.cooldowns.dash} now={now} color="#7dd3fc" />
            <Cooldown label="Q" name={self.skillName} readyAt={self.cooldowns.skill} now={now} color="#22d3ee" />
            <Cooldown label="R" name={self.ultimateName} readyAt={self.cooldowns.ultimate} now={now} color="#e879f9" />
          </>
        )}
      </div>

      {/* Touch buttons (mobile architecture) */}
      {touch && (
        <div className="pointer-events-auto absolute right-4 bottom-24 grid grid-cols-2 gap-2">
          {(
            [
              ["Dash", () => touch.buttons.dash = true, () => touch.buttons.dash = false],
              ["Q", () => touch.buttons.skill = true, () => touch.buttons.skill = false],
              ["R", () => touch.buttons.ultimate = true, () => touch.buttons.ultimate = false],
              ["Loot", () => touch.trigger("pickup"), () => undefined],
              ["Potion", () => touch.trigger("potion"), () => undefined],
              ["Buy", () => touch.trigger("buy"), () => undefined],
            ] as const
          ).map(([label, down, up]) => (
            <button key={label} onPointerDown={down} onPointerUp={up} className="glass h-14 w-14 rounded-full text-xs font-bold">
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Leave */}
      <div className="pointer-events-auto absolute bottom-3 left-3">
        <Button size="sm" variant="secondary" onClick={onLeave}>
          ⟵ Menu
        </Button>
      </div>

      {/* Scoreboard hint */}
      <div className="absolute bottom-3 right-3 max-h-60 w-64 overflow-hidden text-xs">
        <div className="glass p-2">
          <div className="mb-1 font-display text-[10px] tracking-widest text-slate-400">NEARBY</div>
          {h.scoreboard.slice(0, 8).map((p) => (
            <div key={p.id} className="flex justify-between">
              <span className={p.isBot ? "text-slate-400" : "text-slate-200"}>
                {p.name} <span className="text-cyan-300">{p.level}</span>
              </span>
              <span>
                {p.kills}/{p.deaths} · {p.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Match end */}
      {h.standings && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="glass w-full max-w-md p-6">
            <h2 className="mb-4 text-center font-display text-2xl font-black text-cyan-300">MATCH RESULTS</h2>
            <ol className="flex flex-col gap-1 text-sm">
              {h.standings.slice(0, 10).map((s) => (
                <li key={s.id} className="flex justify-between rounded bg-white/5 px-3 py-1.5">
                  <span>
                    #{s.placement} {s.name}
                  </span>
                  <span>
                    {s.kills} K · {s.deaths} D · <b className="text-cyan-300">{s.score}</b>
                  </span>
                </li>
              ))}
            </ol>
            <Button variant="primary" className="mt-5 w-full" onClick={onLeave}>
              Back to menu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

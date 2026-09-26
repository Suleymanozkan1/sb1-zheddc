import { REGIONS, generateArena } from "@cryptoarena/game-core";
import { Button, cx } from "@cryptoarena/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REGION_STYLE } from "../game/art/world";
import { useHud } from "../game/hud";
import type { TouchInput } from "../game/input";
import { useApp } from "../lib/store";

const css = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

// ───────────────────────── Icons ─────────────────────────

const ICONS: Record<string, ReactNode> = {
  attack: <path d="M4 20 L14 10 M12 4 L20 4 L20 12 L11 21 L3 13 Z M6 16 L8 18" />,
  dash: <path d="M3 7 H13 M5 12 H17 M3 17 H13 M15 5 L21 12 L15 19" />,
  skill: <path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z" />,
  ultimate: <path d="M12 2 L14.6 8.6 L21.5 9.2 L16.2 13.7 L17.9 20.5 L12 16.8 L6.1 20.5 L7.8 13.7 L2.5 9.2 L9.4 8.6 Z" />,
  potion: <path d="M9 2 H15 M10 2 V8 L5 17 A3 3 0 0 0 8 21 H16 A3 3 0 0 0 19 17 L14 8 V2 M7 14 H17" />,
  sword: <path d="M4 20 L14 10 M12 4 L20 4 L20 12 L11 21 L3 13 Z" />,
  skull: <path d="M12 3 A8 8 0 0 0 4 11 V15 L7 17 V21 H17 V17 L20 15 V11 A8 8 0 0 0 12 3 Z M9 11 A1.5 1.5 0 1 0 9 14 A1.5 1.5 0 1 0 9 11 M15 11 A1.5 1.5 0 1 0 15 14 A1.5 1.5 0 1 0 15 11" />,
  coin: <path d="M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M12 7 V17 M9 9.5 H14 A1.8 1.8 0 0 1 14 13 H10 A1.8 1.8 0 0 0 10 16.5 H15" />,
  star: <path d="M12 3 L14.3 9 H20.5 L15.5 12.8 L17.4 19 L12 15.2 L6.6 19 L8.5 12.8 L3.5 9 H9.7 Z" />,
};

function Icon({ name, className, color }: { name: string; className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color ?? "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

// ───────────────────────── Bars ─────────────────────────

/** Skewed bar with a white "chip" trail that drains after damage. */
function VitalBar({ value, max, color, height = 14, label }: { value: number; max: number; color: string; height?: number; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  const [trail, setTrail] = useState(pct);
  useEffect(() => {
    if (pct >= trail) {
      setTrail(pct);
      return;
    }
    const t = setTimeout(() => setTrail(pct), 350);
    return () => clearTimeout(t);
  }, [pct, trail]);
  return (
    <div className="hud-bar" style={{ height }}>
      <i style={{ width: `${trail}%`, background: "rgb(255 255 255 / 0.75)", transition: "width 0.6s ease-out" }} />
      <i className="fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 12px ${color}`, transition: "width 0.12s linear" }} />
      {label && <span className="absolute inset-0 z-10 flex items-center justify-center font-display text-[10px] font-bold tracking-wider text-white drop-shadow-[0_1px_1px_#000]" style={{ transform: "skewX(12deg)" }}>{label}</span>}
    </div>
  );
}

function Portrait({ src, color, level, xp, xpMax }: { src: string; color: string; level: number; xp: number; xpMax: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = xpMax > 0 ? Math.min(1, xp / xpMax) : 0;
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg viewBox="0 0 92 92" className="absolute inset-0 -rotate-90">
        <circle cx="46" cy="46" r={r} stroke="rgb(2 6 23 / 0.9)" strokeWidth="7" fill="none" />
        <circle cx="46" cy="46" r={r} stroke="#facc15" strokeWidth="5" fill="none" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #facc15)", transition: "stroke-dashoffset 0.4s" }} />
      </svg>
      <div className="absolute inset-[11px] overflow-hidden rounded-full border border-white/10" style={{ background: `radial-gradient(circle at 50% 35%, ${color}66, #020617 75%)`, boxShadow: `inset 0 0 18px ${color}88` }}>
        {src && <img src={src} alt="" className="h-full w-full scale-[1.9] -rotate-90 object-contain" draggable={false} />}
      </div>
      <div className="absolute -bottom-1 left-1/2 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-md border border-amber-300/60 bg-slate-950 px-1.5 font-display text-xs font-black text-amber-300 shadow-[0_0_10px_#facc1566]">{level}</div>
    </div>
  );
}

// ───────────────────────── Abilities ─────────────────────────

function AbilitySlot({ icon, keyLabel, name, readyAt, now, color, count }: { icon: string; keyLabel: string; name: string; readyAt: number; now: number; color: string; count?: number }) {
  // The server only sends "ready at"; remember the longest remaining time seen to draw the sweep.
  const total = useRef(1);
  const remaining = Math.max(0, readyAt - now);
  if (remaining > total.current || remaining === 0) total.current = Math.max(1, remaining);
  const frac = remaining > 0 ? remaining / total.current : 0;
  const ready = remaining === 0 && (count === undefined || count > 0);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cx("hud-slot", ready && "ready")} style={{ ["--slot-color" as string]: color }}>
        <div className="content relative grid h-full w-full place-items-center">
          <Icon name={icon} className="h-7 w-7" color={ready ? color : "#64748b"} />
          {remaining > 0 && (
            <>
              <div className="absolute inset-0 rounded-[14px]" style={{ background: `conic-gradient(rgb(2 6 23 / 0.8) ${frac * 360}deg, transparent 0)` }} />
              <span className="absolute font-display text-sm font-black text-white drop-shadow-[0_1px_2px_#000]">{(remaining / 1000).toFixed(remaining < 3000 ? 1 : 0)}</span>
            </>
          )}
          {count !== undefined && <span className="absolute right-1 bottom-0 font-display text-[11px] font-bold text-white">{count}</span>}
        </div>
      </div>
      <div className="flex flex-col items-center leading-tight">
        <span className="rounded border border-white/15 bg-slate-950/90 px-1.5 font-display text-[9px] font-bold text-slate-200">{keyLabel}</span>
        <span className="mt-0.5 max-w-20 truncate text-[10px] text-slate-400">{name}</span>
      </div>
    </div>
  );
}

// ───────────────────────── Minimap ─────────────────────────

function Minimap() {
  const { minimap, worldSize, mapSeed, region, regionKey } = useHud();
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const map = useMemo(() => (mapSeed ? generateArena(mapSeed, worldSize) : null), [mapSeed, worldSize]);

  // Static layer: regions, obstacles, zones — painted once per map.
  useEffect(() => {
    if (!map) return;
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 200;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = c.width / worldSize;
    const mid = (worldSize / 2) * s;
    for (const r of [...REGIONS].reverse()) {
      const st = REGION_STYLE[r.key];
      ctx.fillStyle = css(st?.base ?? r.color);
      ctx.beginPath();
      ctx.arc(mid, mid, Math.min(r.maxR, worldSize * 0.75) * s, 0, Math.PI * 2);
      ctx.fill();
      if (r.minR > 0) {
        ctx.strokeStyle = `${css(st?.accent ?? 0xffffff)}66`;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(mid, mid, r.minR * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.fillStyle = "rgba(2,6,23,0.7)";
    for (const o of map.obstacles) {
      if (o.kind === "circle") {
        ctx.beginPath();
        ctx.arc(o.x * s, o.y * s, Math.max(0.8, o.r * s), 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(o.x * s, o.y * s, Math.max(1, o.w * s), Math.max(1, o.h * s));
    }
    for (const z of map.zones) {
      ctx.fillStyle = z.kind === "safe" ? "rgba(56,189,248,0.55)" : z.kind === "healing" ? "rgba(74,222,128,0.45)" : "rgba(250,204,21,0.45)";
      ctx.beginPath();
      ctx.arc(z.x * s, z.y * s, Math.max(2, z.r * s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#7dd3fc";
    for (const m of map.merchants) ctx.fillRect(m.x * s - 2, m.y * s - 2, 4, 4);
    base.current = c;
  }, [map, worldSize]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !base.current) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = c.width / worldSize;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(base.current, 0, 0);
    const self = minimap.find((d) => d.kind === "self");
    if (self) {
      // approximate camera view rectangle
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.strokeRect((self.x - 960) * s, (self.y - 540) * s, 1920 * s, 1080 * s);
    }
    for (const d of minimap) {
      if (d.kind === "self") continue;
      ctx.fillStyle = d.kind === "player" ? "#fbbf24" : d.kind === "boss" ? "#f43f5e" : "rgba(248,113,113,0.75)";
      const r = d.kind === "boss" ? 4.5 : d.kind === "player" ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(d.x * s, d.y * s, r, 0, Math.PI * 2);
      ctx.fill();
      if (d.kind === "boss") {
        ctx.strokeStyle = "#fda4af";
        ctx.beginPath();
        ctx.arc(d.x * s, d.y * s, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (self) {
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(self.x * s, self.y * s, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [minimap, map, worldSize]);

  const accent = css(REGION_STYLE[regionKey]?.accent ?? 0x22d3ee);
  return (
    <div className="hud-panel p-2" style={{ ["--hud-accent" as string]: accent }}>
      <div className="relative">
        <canvas ref={ref} width={200} height={200} className="block h-[130px] w-[130px] rounded-full md:h-[180px] md:w-[180px]" style={{ boxShadow: `0 0 0 2px ${accent}55, 0 0 24px ${accent}33` }} />
        <span className="absolute top-0 left-1/2 -translate-x-1/2 font-display text-[10px] font-bold text-slate-300">N</span>
      </div>
      <div className="mt-1 text-center font-display text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: accent }}>
        {region}
      </div>
    </div>
  );
}

// ───────────────────────── Region banner ─────────────────────────

function RegionBanner() {
  const { region, regionKey } = useHud();
  const [shown, setShown] = useState<{ key: string; name: string; n: number } | null>(null);
  const last = useRef("");
  useEffect(() => {
    if (!regionKey || regionKey === last.current) return;
    last.current = regionKey;
    setShown((s) => ({ key: regionKey, name: region, n: (s?.n ?? 0) + 1 }));
  }, [regionKey, region]);
  if (!shown) return null;
  const def = REGIONS.find((r) => r.key === shown.key);
  const accent = css(REGION_STYLE[shown.key]?.accent ?? 0x22d3ee);
  return (
    <div key={shown.n} className="hud-banner absolute top-28 left-1/2 text-center">
      <div className="font-display text-[10px] font-bold tracking-[0.5em] text-slate-400">TIER {def?.tier ?? 1} REGION</div>
      <div className="font-display text-3xl font-black uppercase" style={{ color: accent, textShadow: `0 0 18px ${accent}, 0 2px 0 #000` }}>
        {shown.name}
      </div>
      <div className="mx-auto mt-1 h-px w-64" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
    </div>
  );
}

// ───────────────────────── HUD ─────────────────────────

export function Hud({ onLeave, touch }: { onLeave: () => void; touch: TouchInput | null }) {
  const h = useHud();
  const showFps = useApp((s) => s.settings.showFps);
  const self = h.self;
  const now = h.serverNow;
  const phaseLeft = h.phaseEndsAt > 0 ? Math.max(0, Math.ceil((h.phaseEndsAt - now) / 1000)) : 0;
  const color = css(h.selfColor);
  const hpPct = h.maxHp > 0 ? h.hp / h.maxHp : 1;
  const hpColor = hpPct > 0.5 ? "#4ade80" : hpPct > 0.25 ? "#facc15" : "#f43f5e";
  const respawnIn = Math.max(0, Math.ceil((h.respawnAt - now) / 1000));
  const rank = h.scoreboard.findIndex((p) => p.name === h.selfName) + 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {h.alive && hpPct < 0.3 && h.connected && <div className="hud-lowhp absolute inset-0" />}

      {/* Top-left: hero frame */}
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="hud-panel flex w-[340px] max-w-[calc(100vw-24px)] items-center gap-3 p-3" style={{ ["--hud-accent" as string]: color }}>
          <Portrait src={h.portrait} color={color} level={h.level} xp={self?.xpIntoLevel ?? 0} xpMax={self?.xpForNext ?? 1} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-sm font-black text-white">{h.selfName}</span>
              <span className="font-display text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
                {h.selfClass}
              </span>
            </div>
            <VitalBar value={h.hp} max={h.maxHp} color={hpColor} height={16} label={`${Math.round(h.hp)} / ${h.maxHp} HP`} />
            <VitalBar value={self?.xpIntoLevel ?? 0} max={self?.xpForNext ?? 1} color="#facc15" height={5} />
            <div className="mt-0.5 grid grid-cols-4 gap-1 text-[11px]">
              <Stat icon="coin" color="#fbbf24" value={`+${self?.gold ?? 0}`} />
              <Stat icon="sword" color="#f87171" value={h.kills} />
              <Stat icon="skull" color="#94a3b8" value={h.deaths} />
              <Stat icon="star" color="#22d3ee" value={h.score} />
            </div>
          </div>
        </div>
        {showFps && (
          <div className="font-mono text-[10px] text-slate-400">
            {h.fps} FPS · <span className={h.ping > 150 ? "text-rose-400" : "text-emerald-400"}>{h.ping} ms</span>
          </div>
        )}
      </div>

      {/* Top-center: match phase */}
      {h.mode === "RANKED" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div className="hud-panel px-6 py-2 text-center" style={{ ["--hud-accent" as string]: "#f43f5e" }}>
            <div className="font-display text-[9px] font-bold tracking-[0.4em] text-rose-300">RANKED</div>
            <div className="font-display text-xl font-black text-white tabular-nums">
              {h.phase === "waiting" && <span className="text-base text-slate-300">Waiting for players…</span>}
              {h.phase === "countdown" && <span className="text-amber-300">{phaseLeft}</span>}
              {h.phase === "running" && `${Math.floor(phaseLeft / 60)}:${String(phaseLeft % 60).padStart(2, "0")}`}
              {h.phase === "ended" && <span className="text-base">Match over</span>}
            </div>
          </div>
        </div>
      )}

      <RegionBanner />

      {/* Top-right: minimap + kill feed */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <Minimap />
        <ul className="flex w-72 flex-col gap-1 text-xs">
          {h.killFeed.map((k) => (
            <li key={k.id} className="hud-feed flex items-center justify-end gap-2 rounded-sm border-r-2 border-rose-500 bg-gradient-to-l from-slate-950/90 to-slate-950/20 px-2 py-1">
              <span className="font-semibold text-amber-300">{k.killerName}</span>
              <Icon name="sword" className="h-3.5 w-3.5" color="#f87171" />
              <span className={k.victimIsNpc ? "text-rose-300" : "font-semibold text-cyan-200"}>{k.victimName}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Center notices */}
      <div className="absolute top-48 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        {h.notices.map((n) => (
          <div key={n.id} className="hud-notice font-display text-base font-black tracking-wide" style={{ color: n.color, textShadow: `0 0 14px ${n.color}, 0 2px 0 #000` }}>
            {n.text}
          </div>
        ))}
      </div>

      {/* Interaction prompts */}
      <div className="absolute bottom-36 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {h.nearLoot && <Prompt k="E" text="Pick up loot" color="#fbbf24" />}
        {h.nearMerchant && <Prompt k="B" text="Buy 5 potions" color="#38bdf8" />}
      </div>

      {/* Bottom: ability dock */}
      {self && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="hud-panel flex items-end gap-5 px-6 pt-4 pb-2">
            <AbilitySlot icon="attack" keyLabel="LMB" name="Attack" readyAt={self.cooldowns.attack} now={now} color="#e2e8f0" />
            <AbilitySlot icon="dash" keyLabel="SPACE" name="Dash" readyAt={self.cooldowns.dash} now={now} color="#7dd3fc" />
            <AbilitySlot icon="skill" keyLabel="Q" name={self.skillName} readyAt={self.cooldowns.skill} now={now} color="#22d3ee" />
            <AbilitySlot icon="ultimate" keyLabel="R" name={self.ultimateName} readyAt={self.cooldowns.ultimate} now={now} color="#e879f9" />
            <div className="mx-1 h-12 w-px self-center bg-white/10" />
            <AbilitySlot icon="potion" keyLabel="F" name="Potion" readyAt={0} now={now} color="#f472b6" count={self.potions} />
          </div>
        </div>
      )}

      {/* Death overlay */}
      {!h.alive && h.connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgb(76_5_25/0.35),rgb(2_6_23/0.85))] backdrop-grayscale">
          <div className="text-center">
            <div className="font-display text-xs font-bold tracking-[0.6em] text-rose-300/80">YOU WERE</div>
            <h2 className="font-display text-6xl font-black text-rose-500" style={{ textShadow: "0 0 30px #f43f5e, 0 4px 0 #000" }}>
              ELIMINATED
            </h2>
            {h.killedBy && (
              <p className="mt-3 text-slate-300">
                by <span className="font-display font-bold text-amber-300">{h.killedBy}</span>
              </p>
            )}
            <div className="relative mx-auto mt-6 h-20 w-20">
              <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
                <circle cx="40" cy="40" r="34" stroke="rgb(255 255 255 / 0.1)" strokeWidth="5" fill="none" />
                <circle cx="40" cy="40" r="34" stroke="#f43f5e" strokeWidth="5" fill="none" strokeDasharray={213.6} strokeDashoffset={213.6 * Math.min(1, respawnIn / 5)} style={{ transition: "stroke-dashoffset 1s linear" }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-display text-3xl font-black text-white">{respawnIn}</span>
            </div>
            <p className="mt-2 text-xs tracking-widest text-slate-400">RESPAWNING</p>
          </div>
        </div>
      )}

      {/* Touch buttons (mobile architecture) */}
      {touch && (
        <div className="pointer-events-auto absolute right-4 bottom-32 grid grid-cols-2 gap-2">
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
            <button key={label} onPointerDown={down} onPointerUp={up} className="h-14 w-14 rounded-full border border-cyan-400/40 bg-slate-950/80 font-display text-xs font-bold text-cyan-100 shadow-[0_0_14px_#22d3ee44] active:scale-95">
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

      {/* Scoreboard */}
      <div className="absolute right-3 bottom-3 hidden w-60 text-xs md:block">
        <div className="hud-panel p-2.5" style={{ ["--hud-accent" as string]: "#fbbf24" }}>
          <div className="mb-1.5 flex justify-between font-display text-[9px] font-bold tracking-[0.3em] text-slate-400">
            <span>LEADERS</span>
            {rank > 0 && <span className="text-cyan-300">YOU #{rank}</span>}
          </div>
          {h.scoreboard.slice(0, 6).map((p, i) => (
            <div key={p.id} className={cx("flex items-center justify-between rounded px-1 py-0.5", p.name === h.selfName && "bg-cyan-400/10")}>
              <span className={cx("flex min-w-0 items-center gap-1.5", p.isBot ? "text-slate-400" : "text-slate-100")}>
                <span className={cx("w-3 font-display text-[10px] font-black", i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-400" : "text-slate-500")}>{i + 1}</span>
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] text-cyan-300">{p.level}</span>
              </span>
              <span className="font-mono tabular-nums text-slate-300">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Match end */}
      {h.standings && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="hud-panel w-full max-w-md p-6">
            <h2 className="mb-4 text-center font-display text-3xl font-black text-cyan-300" style={{ textShadow: "0 0 20px #22d3ee" }}>
              MATCH RESULTS
            </h2>
            <ol className="flex flex-col gap-1 text-sm">
              {h.standings.slice(0, 10).map((s) => (
                <li key={s.id} className={cx("flex justify-between rounded px-3 py-1.5", s.placement === 1 ? "bg-amber-400/15 text-amber-200" : "bg-white/5")}>
                  <span>
                    <b className="font-display">#{s.placement}</b> {s.name}
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

function Stat({ icon, color, value }: { icon: string; color: string; value: ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded bg-slate-950/60 px-1.5 py-0.5 font-mono tabular-nums text-slate-200">
      <Icon name={icon} className="h-3 w-3" color={color} />
      {value}
    </span>
  );
}

function Prompt({ k, text, color }: { k: string; text: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-slate-950/85 py-1 pr-3 pl-1 text-xs text-slate-100" style={{ borderColor: `${color}66`, boxShadow: `0 0 14px ${color}33` }}>
      <span className="grid h-6 w-6 place-items-center rounded-full font-display text-[11px] font-black text-slate-950" style={{ background: color }}>
        {k}
      </span>
      {text}
    </div>
  );
}

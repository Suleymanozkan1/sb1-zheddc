import { CHARACTERS } from "@cryptoarena/game-core";
import type { CharacterDto, CombatStats } from "@cryptoarena/shared";
import { cx } from "@cryptoarena/ui";
import { useMemo, type CSSProperties } from "react";
import { heroImage } from "../game/art/characters";
import { t as tNow, useT, useTc } from "../lib/i18n";
import { RarityTag } from "./RarityTag";

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function characterColor(key: string): string {
  return hex(CHARACTERS.find((c) => c.key === key)?.color ?? 0x22d3ee);
}

/** CSS custom properties that tint a component with the class color. */
export function accentVars(key: string): CSSProperties {
  const color = characterColor(key);
  return { ["--accent" as string]: color, ["--accent-soft" as string]: `${color}33`, ["--hud-accent" as string]: color };
}

const ROLE: Record<string, string> = { warrior: "Bruiser", assassin: "Burst", tank: "Vanguard", ranger: "Marksman", mage: "Arcanist" };

/** Role label in the current language (callers re-render on language change via useT). */
export function roleOf(key: string): string {
  return tNow(ROLE[key] ?? "Hero");
}

/** Painted hero sprite (same art as in the arena), facing up. */
export function HeroArt({ keyName, size, className, style }: { keyName: string; size: number; className?: string; style?: CSSProperties }) {
  const src = useMemo(() => heroImage(keyName, size > 180 ? 3 : 2), [keyName, size]);
  const color = characterColor(keyName);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      width={size}
      height={size}
      className={cx("pointer-events-none select-none", className)}
      style={{ filter: `drop-shadow(0 0 ${Math.round(size / 10)}px ${color}88) drop-shadow(0 ${Math.round(size / 24)}px ${Math.round(size / 18)}px #000c)`, ...style }}
    />
  );
}

export function Avatar({ keyName, size = 64 }: { keyName: string; size?: number }) {
  const color = characterColor(keyName);
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border"
      style={{ width: size, height: size, borderColor: `${color}88`, background: `radial-gradient(circle at 50% 40%, ${color}55, #020617 72%)`, boxShadow: `0 0 22px ${color}55, inset 0 0 18px ${color}44` }}
    >
      <HeroArt keyName={keyName} size={Math.round(size * 1.35)} className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

const STAT_ROWS: { key: keyof CombatStats; label: string; fmt: (v: number) => string }[] = [
  { key: "maxHp", label: "HP", fmt: (v) => String(Math.round(v)) },
  { key: "damage", label: "Damage", fmt: (v) => v.toFixed(0) },
  { key: "armor", label: "Armor", fmt: (v) => v.toFixed(0) },
  { key: "speed", label: "Speed", fmt: (v) => String(Math.round(v)) },
  { key: "attackSpeed", label: "Atk/s", fmt: (v) => v.toFixed(2) },
  { key: "critChance", label: "Crit", fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "range", label: "Range", fmt: (v) => String(Math.round(v)) },
  { key: "lifesteal", label: "Lifesteal", fmt: (v) => `${(v * 100).toFixed(1)}%` },
];

export function StatsGrid({ c }: { c: CharacterDto }) {
  const s = c.progress?.stats ?? c.base;
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-1.5 text-xs">
      {STAT_ROWS.map((r) => (
        <div key={r.key} className="rounded-md border border-white/5 bg-slate-950/60 px-2 py-1.5">
          <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">{t(r.label)}</div>
          <div className="font-display text-sm font-bold text-slate-100 tabular-nums">{r.fmt(s[r.key])}</div>
        </div>
      ))}
    </div>
  );
}

const RADAR_AXES: { key: keyof CombatStats; label: string }[] = [
  { key: "maxHp", label: "HP" },
  { key: "damage", label: "DMG" },
  { key: "attackSpeed", label: "ATK SPD" },
  { key: "range", label: "RANGE" },
  { key: "speed", label: "SPEED" },
  { key: "armor", label: "ARMOR" },
];

/** Hexagonal stat radar, normalised against the strongest hero on each axis. */
export function StatRadar({ c, all, size = 220 }: { c: CharacterDto; all: CharacterDto[]; size?: number }) {
  const t = useT();
  const color = characterColor(c.key);
  const stats = c.progress?.stats ?? c.base;
  const r = size / 2 - 28;
  const mid = size / 2;
  const max = RADAR_AXES.map((a) => Math.max(1e-6, ...all.map((x) => (x.progress?.stats ?? x.base)[a.key]), stats[a.key]));
  const point = (i: number, f: number): [number, number] => {
    const ang = -Math.PI / 2 + (i / RADAR_AXES.length) * Math.PI * 2;
    return [mid + Math.cos(ang) * r * f, mid + Math.sin(ang) * r * f];
  };
  const shape = RADAR_AXES.map((a, i) => point(i, 0.12 + 0.88 * Math.min(1, stats[a.key] / max[i]!)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={RADAR_AXES.map((_, i) => point(i, f).join(",")).join(" ")} fill="none" stroke="rgb(148 163 184 / 0.18)" strokeWidth={1} />
      ))}
      {RADAR_AXES.map((a, i) => {
        const [x, y] = point(i, 1);
        const [lx, ly] = point(i, 1.2);
        return (
          <g key={a.key}>
            <line x1={mid} y1={mid} x2={x} y2={y} stroke="rgb(148 163 184 / 0.15)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 font-display" fontSize={9} fontWeight={700} letterSpacing={1}>
              {t(a.label)}
            </text>
          </g>
        );
      })}
      <polygon points={shape} fill={`${color}40`} stroke={color} strokeWidth={2} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "all 0.4s" }} />
      {RADAR_AXES.map((a, i) => {
        const [x, y] = point(i, 0.12 + 0.88 * Math.min(1, stats[a.key] / max[i]!));
        return <circle key={a.key} cx={x} cy={y} r={3} fill="#fff" stroke={color} strokeWidth={2} />;
      })}
    </svg>
  );
}

/** Roster card for the character select grid. */
export function CharacterCard({ c, selected, equipped, onClick }: { c: CharacterDto; selected?: boolean; equipped?: boolean; onClick?: () => void }) {
  const t = useT();
  const tc = useTc();
  return (
    <button onClick={onClick} className={cx("roster-card hex-bg group flex w-full flex-col items-center px-3 pt-3 pb-3 text-left", selected && "active")} style={accentVars(c.key)}>
      <div className="flex w-full items-center justify-between">
        <span className="font-display text-[9px] font-bold tracking-[0.25em] uppercase" style={{ color: characterColor(c.key) }}>
          {roleOf(c.key)}
        </span>
        {equipped && <span className="rounded-sm bg-emerald-400/15 px-1.5 font-display text-[9px] font-bold tracking-widest text-emerald-300">{t("EQUIPPED")}</span>}
      </div>
      <div className="relative my-1 grid h-28 w-full place-items-center">
        <div className="absolute h-20 w-20 rounded-full opacity-60 blur-xl" style={{ background: characterColor(c.key) }} />
        <div className={cx("hero relative", !c.owned && "opacity-60 brightness-50 grayscale")}>
          <HeroArt keyName={c.key} size={128} />
        </div>
        {!c.owned && (
          <div className="absolute inset-0 grid place-items-center">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex w-full items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-black tracking-wide text-white">{tc("char", c.key, c.name)}</h3>
          <RarityTag rarity={c.rarity} />
        </div>
        {c.progress ? (
          <div className="text-right">
            <div className="font-display text-[9px] font-bold tracking-widest text-slate-500">{t("LEVEL")}</div>
            <div className="font-display text-xl leading-none font-black text-white">{c.progress.level}</div>
          </div>
        ) : (
          <span className="font-display text-[10px] font-bold tracking-widest text-amber-300">{t("LOCKED")}</span>
        )}
      </div>
      {c.progress && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.progress.xpIntoLevel / Math.max(1, c.progress.xpForNext)) * 100)}%`, background: characterColor(c.key), boxShadow: `0 0 8px ${characterColor(c.key)}` }} />
        </div>
      )}
    </button>
  );
}

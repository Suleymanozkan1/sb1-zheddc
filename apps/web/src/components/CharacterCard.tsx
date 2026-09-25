import { CHARACTERS } from "@cryptoarena/game-core";
import type { CharacterDto } from "@cryptoarena/shared";
import { ProgressBar, RarityBadge, cx } from "@cryptoarena/ui";

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function characterColor(key: string): string {
  return hex(CHARACTERS.find((c) => c.key === key)?.color ?? 0x22d3ee);
}

export function Avatar({ keyName, size = 64 }: { keyName: string; size?: number }) {
  const color = characterColor(keyName);
  const icons: Record<string, string> = { warrior: "⚔️", assassin: "🗡️", tank: "🛡️", ranger: "🏹", mage: "🔮" };
  return (
    <div className="relative grid place-items-center rounded-full" style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, ${color}, ${color}33 70%)`, boxShadow: `0 0 24px ${color}66` }}>
      <span style={{ fontSize: size * 0.42 }}>{icons[keyName] ?? "★"}</span>
    </div>
  );
}

export function StatsGrid({ c }: { c: CharacterDto }) {
  const s = c.progress?.stats ?? c.base;
  const rows: [string, string][] = [
    ["HP", String(s.maxHp)],
    ["Damage", s.damage.toFixed(0)],
    ["Armor", s.armor.toFixed(0)],
    ["Speed", String(s.speed)],
    ["Atk/s", s.attackSpeed.toFixed(2)],
    ["Crit", `${(s.critChance * 100).toFixed(1)}%`],
    ["Range", String(s.range)],
    ["Lifesteal", `${(s.lifesteal * 100).toFixed(1)}%`],
  ];
  return (
    <div className="grid grid-cols-4 gap-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
          <div className="font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function CharacterCard({ c, selected, onClick }: { c: CharacterDto; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx("glass flex w-full flex-col gap-3 p-4 text-left transition hover:border-cyan-400/40", selected && "border-cyan-400/70 shadow-[0_0_24px_rgb(34_211_238/0.25)]", !c.owned && "opacity-70")}
    >
      <div className="flex items-center gap-3">
        <Avatar keyName={c.key} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold">{c.name}</h3>
            <RarityBadge rarity={c.rarity} />
          </div>
          <p className="truncate text-xs text-slate-400">{c.description}</p>
          {c.progress ? (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="font-bold text-cyan-300">Lv {c.progress.level}</span>
              <ProgressBar value={c.progress.xpIntoLevel} max={c.progress.xpForNext} className="flex-1" />
            </div>
          ) : (
            <span className="text-xs text-amber-300">Locked</span>
          )}
        </div>
      </div>
    </button>
  );
}

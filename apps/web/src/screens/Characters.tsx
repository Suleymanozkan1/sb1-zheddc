import { StatKey, type BalancesDto, type CharacterDto, type SkillDto } from "@cryptoarena/shared";
import { Button, RarityBadge, Spinner, cx } from "@cryptoarena/ui";
import { useState } from "react";
import { CharacterCard, HeroArt, StatRadar, StatsGrid, accentVars, characterColor, roleOf } from "../components/CharacterCard";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { price } from "../lib/format";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

const STAT_LABEL: Record<StatKey, string> = { HP: "Health", DAMAGE: "Damage", ARMOR: "Armor", SPEED: "Speed", ATTACK_SPEED: "Attack speed", CRIT_CHANCE: "Crit chance" };

function AbilityCard({ keyLabel, kind, skill, color }: { keyLabel: string; kind: string; skill: SkillDto; color: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-white/5 bg-slate-950/60 p-2.5">
      <div className="grid h-11 w-11 shrink-0 rotate-45 place-items-center rounded-lg border" style={{ borderColor: `${color}99`, background: `radial-gradient(circle, ${color}33, #020617)`, boxShadow: `0 0 14px -2px ${color}` }}>
        <span className="-rotate-45 font-display text-sm font-black" style={{ color }}>
          {keyLabel}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold text-white">{skill.name}</span>
          <span className="font-display text-[9px] font-bold tracking-widest text-slate-500 uppercase">{kind}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">{skill.cooldownMs / 1000}s</span>
        </div>
        <p className="text-xs leading-snug text-slate-400">{skill.description}</p>
      </div>
    </div>
  );
}

function Stage({ c }: { c: CharacterDto }) {
  const color = characterColor(c.key);
  return (
    <div className="relative grid h-[300px] place-items-center overflow-hidden md:h-[360px]">
      {/* light column + floor */}
      <div className="absolute inset-x-10 top-0 bottom-16 opacity-50" style={{ background: `radial-gradient(ellipse at 50% 100%, ${color}55, transparent 65%)` }} />
      <div className="absolute bottom-10 h-16 w-72 rounded-[50%]" style={{ background: `radial-gradient(ellipse, ${color}66, transparent 70%)` }} />
      <svg viewBox="0 0 300 300" className="ring-spin absolute h-[280px] w-[280px] md:h-[330px] md:w-[330px]">
        <circle cx="150" cy="150" r="140" fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 10" />
        <circle cx="150" cy="150" r="118" fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={8} strokeDasharray="60 30" />
      </svg>
      <svg viewBox="0 0 300 300" className="ring-spin-rev absolute h-[220px] w-[220px] md:h-[260px] md:w-[260px]">
        <circle cx="150" cy="150" r="140" fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={1} strokeDasharray="2 6" />
      </svg>
      <div key={c.key} className="hero-in relative">
        <HeroArt keyName={c.key} size={280} className="hero-float" />
      </div>
      {c.progress && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sm border bg-slate-950/90 px-3 py-0.5 font-display text-xs font-black tracking-widest" style={{ borderColor: `${color}88`, color }}>
          LEVEL {c.progress.level}
        </div>
      )}
    </div>
  );
}

export function Characters() {
  const { me, selectedCharacterId, selectCharacter, setBalances, toast } = useApp();
  const chars = useAsync(() => api.characters(), []);
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = chars.data ?? [];
  const current: CharacterDto | undefined = list.find((c) => c.key === focus) ?? list.find((c) => c.progress?.userCharacterId === selectedCharacterId) ?? list[0];

  const act = async (key: string, fn: () => Promise<{ characters: CharacterDto[]; balances: BalancesDto }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      chars.setData(res.characters);
      setBalances(res.balances);
      toast("success", ok);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const color = current ? characterColor(current.key) : "#22d3ee";
  const isEquipped = !!current?.progress && current.progress.userCharacterId === selectedCharacterId;

  return (
    <Page title="Choose your hero" subtitle="Five classes, levels 1–50. Level up to earn stat points, then invest gold to raise stats.">
      {chars.loading && !chars.data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          {current && (
            <section className="hud-panel hex-bg grid gap-2 p-4 lg:grid-cols-[1.05fr_1.2fr_0.9fr] lg:p-5" style={accentVars(current.key)}>
              <Stage c={current} />

              <div key={current.key} className="hero-in flex flex-col gap-3">
                <div>
                  <div className="font-display text-[10px] font-bold tracking-[0.4em] uppercase" style={{ color }}>
                    {roleOf(current.key)} · {current.class}
                  </div>
                  <h2 className="font-display text-4xl font-black tracking-wide text-white md:text-5xl" style={{ textShadow: `0 0 24px ${color}88` }}>
                    {current.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    <RarityBadge rarity={current.rarity} />
                    {current.isStarter && <span className="font-display text-[10px] font-bold tracking-widest text-slate-400">STARTER</span>}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-300">{current.description}</p>
                <div className="flex flex-col gap-2">
                  <AbilityCard keyLabel="Q" kind="Skill" skill={current.skill} color="#22d3ee" />
                  <AbilityCard keyLabel="R" kind="Ultimate" skill={current.ultimate} color="#e879f9" />
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  {current.owned && current.progress ? (
                    <>
                      <Button size="lg" variant={isEquipped ? "success" : "primary"} className="min-w-52" onClick={() => selectCharacter(current.progress!.userCharacterId)}>
                        {isEquipped ? "✓ Selected" : "Select for battle"}
                      </Button>
                      {current.progress.statPoints > 0 && (
                        <span className="font-display text-xs font-bold text-amber-300">
                          {current.progress.statPoints} stat point{current.progress.statPoints === 1 ? "" : "s"} to spend ↓
                        </span>
                      )}
                    </>
                  ) : current.unlockProduct ? (
                    <>
                      <Button size="lg" variant="primary" className="min-w-52" loading={busy === "unlock"} onClick={() => act("unlock", () => api.unlockCharacter(current.key, current.unlockProduct!.sku), `${current.name} unlocked!`)}>
                        Unlock for {price(current.unlockProduct.price, current.unlockProduct.currency, me?.balances)}
                      </Button>
                      <p className="text-xs text-slate-400">More unlock options are available in the Shop.</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Not available right now.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 border-t border-white/5 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                <div className="font-display text-[10px] font-bold tracking-[0.3em] text-slate-400">COMBAT PROFILE</div>
                <StatRadar c={current} all={list} size={210} />
                <StatsGrid c={current} />
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-3">
              <h3 className="font-display text-xs font-bold tracking-[0.35em] text-slate-400">ROSTER</h3>
              <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
              <span className="font-mono text-xs text-slate-500">
                {list.filter((c) => c.owned).length}/{list.length} owned
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((c) => (
                <CharacterCard key={c.key} c={c} selected={current?.key === c.key} equipped={!!c.progress && c.progress.userCharacterId === selectedCharacterId} onClick={() => setFocus(c.key)} />
              ))}
            </div>
          </section>

          {current?.owned && current.progress && (
            <section className="hud-panel p-4" style={accentVars(current.key)}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="font-display text-xs font-bold tracking-[0.35em] text-slate-300">UPGRADES</h3>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(10, Math.max(current.progress.statPoints, 1)) }, (_, i) => (
                    <span key={i} className={cx("h-2.5 w-2.5 rotate-45", i < current.progress!.statPoints ? "" : "bg-slate-700")} style={i < current.progress!.statPoints ? { background: color, boxShadow: `0 0 6px ${color}` } : undefined} />
                  ))}
                </div>
                <span className="text-sm text-slate-300">
                  Stat points: <b style={{ color }}>{current.progress.statPoints}</b>
                </span>
              </div>
              {current.progress.statPoints < 1 && (
                <p className="mb-3 text-xs text-slate-400">
                  No stat points left. Each level gives 2 points — earn XP in the arena by defeating creatures and rivals, then come back to upgrade.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {StatKey.map((k) => {
                  const lvl = current.progress!.upgrades[k];
                  return (
                    <div key={k} className="flex items-center gap-3 rounded-md border border-white/5 bg-slate-950/60 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-slate-200">{STAT_LABEL[k]}</span>
                          <span className="font-display text-xs font-bold" style={{ color }}>
                            +{lvl}
                          </span>
                        </div>
                        <div className="mt-1 flex gap-0.5">
                          {Array.from({ length: 10 }, (_, i) => (
                            <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < Math.min(10, lvl) ? color : "rgb(51 65 85)" }} />
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={current.progress!.statPoints < 1}
                        loading={busy === k}
                        onClick={() => act(k, () => api.upgradeCharacter(current.progress!.userCharacterId, k), `${STAT_LABEL[k]} upgraded`)}
                      >
                        +1 · {current.progress!.upgradeCosts[k]} 🪙
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}

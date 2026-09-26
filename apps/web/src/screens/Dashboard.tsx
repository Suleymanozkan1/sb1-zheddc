import type { CharacterDto } from "@cryptoarena/shared";
import { Button, Panel, Spinner, Stat, cx, formatInt, formatToken } from "@cryptoarena/ui";
import { useEffect } from "react";
import { Avatar, StatsGrid } from "../components/CharacterCard";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { isDemo } from "../lib/demo";
import { useT, useTc } from "../lib/i18n";
import { useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

export function Dashboard() {
  const { me, selectedCharacterId, selectCharacter, go, mode, setMode } = useApp();
  const chars = useAsync(() => api.characters(), []);
  const t = useT();
  const tc = useTc();
  const owned = (chars.data ?? []).filter((c) => c.owned);
  const selected: CharacterDto | undefined = owned.find((c) => c.progress?.userCharacterId === selectedCharacterId) ?? owned[0];

  useEffect(() => {
    if (selected?.progress && selected.progress.userCharacterId !== selectedCharacterId) selectCharacter(selected.progress.userCharacterId);
  }, [selected, selectedCharacterId, selectCharacter]);

  if (!me) return null;
  const b = me.balances;
  const demo = isDemo();

  return (
    <Page title={t("Welcome back, {name}", { name: me.username })} subtitle={demo ? t("Offline demo — progress is saved in this browser. Wallets and crypto rewards are disabled.") : me.isGuest ? t("Guest account — link a wallet in Settings to enable crypto features.") : undefined}>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr_340px]">
        {/* Left: character card */}
        <Panel title={t("Your Hero")} actions={<Button size="sm" variant="ghost" onClick={() => go("characters")}>{t("Change")}</Button>}>
          {chars.loading && !chars.data ? (
            <Spinner />
          ) : selected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar keyName={selected.key} size={84} />
                <div>
                  <h2 className="font-display text-2xl font-black">{tc("char", selected.key, selected.name)}</h2>
                  <p className="text-sm text-cyan-300">{t("Level {n}", { n: selected.progress?.level ?? 1 })}</p>
                  <p className="text-xs text-slate-400">{t("{n} stat points available", { n: selected.progress?.statPoints ?? 0 })}</p>
                </div>
              </div>
              <StatsGrid c={selected} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-cyan-400/10 p-2">
                  <div className="font-semibold text-cyan-200">[Q] {tc("skill", selected.skill.key, selected.skill.name)}</div>
                  <div className="text-slate-400">{tc("skillDesc", selected.skill.key, selected.skill.description)}</div>
                </div>
                <div className="rounded-lg bg-fuchsia-400/10 p-2">
                  <div className="font-semibold text-fuchsia-200">[R] {tc("skill", selected.ultimate.key, selected.ultimate.name)}</div>
                  <div className="text-slate-400">{tc("skillDesc", selected.ultimate.key, selected.ultimate.description)}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t("No characters yet.")}</p>
          )}
        </Panel>

        {/* Center: PLAY */}
        <section className="glass relative flex min-h-[420px] flex-col items-center justify-center gap-6 overflow-hidden p-6">
          <div className="grid-bg absolute inset-0 opacity-60" />
          <div className="relative flex rounded-2xl bg-black/30 p-1">
            {(["CASUAL", "RANKED"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("rounded-xl px-6 py-2 text-sm font-bold tracking-widest", mode === m ? "bg-cyan-400 text-black" : "text-slate-300")}>
                {t(m)}
              </button>
            ))}
          </div>
          <Button variant="primary" size="xl" className="relative h-40 w-40 !rounded-full font-display text-3xl md:h-52 md:w-52" disabled={!selected} onClick={() => go("game")}>
            {t("PLAY")}
          </Button>
          <p className="relative max-w-md text-center text-sm text-slate-400">
            {mode === "CASUAL"
              ? t("Persistent open arena. Drop in and out any time — farm, quest and fight.")
              : demo
                ? t("Timed match (3 min) against bots. Highest score wins.")
                : t("Timed match (10 min). Highest score wins. Top 3 earn performance-based tournament rewards.")}
          </p>
          <div className="relative grid grid-cols-3 gap-2 text-[11px] text-slate-400">
            <span>{t("WASD move · Mouse aim")}</span>
            <span>{t("Click attack · Space dash")}</span>
            <span>{t("Q skill · R ultimate · E loot · F potion")}</span>
          </div>
        </section>

        {/* Right: balances */}
        <div className="flex flex-col gap-4">
          <Panel title={t("Balances")} actions={demo ? undefined : <Button size="sm" variant="ghost" onClick={() => go("wallet")}>{t("Wallet")} →</Button>}>
            <div className="grid grid-cols-2 gap-4">
              <Stat label={t("Gold")} value={formatInt(b.gold)} accent="#fbbf24" />
              <Stat label={t("Gems")} value={formatInt(b.gems)} accent="#38bdf8" />
              {!demo && <Stat label={t("Reward ({symbol})", { symbol: b.cryptoSymbol })} value={formatToken(b.cryptoReward, b.cryptoDecimals, 3)} accent="#e879f9" />}
              {!demo && <Stat label={t("Deposited ({symbol})", { symbol: b.cryptoSymbol })} value={formatToken(b.cryptoSpendable, b.cryptoDecimals, 3)} accent="#a3e635" />}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              {demo ? t("Demo balances are play money and reset when you log out.") : t("Reward balance is withdrawable. Deposited balance can be spent in the shop.")}
            </p>
          </Panel>
          <Panel title={t("Quick links")}>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["Shop", "shop"],
                  ["Inventory", "inventory"],
                  ["Quests", "quests"],
                  ["Leaderboard", "leaderboard"],
                ] as const
              ).map(([label, s]) => (
                <Button key={s} onClick={() => go(s)}>
                  {t(label)}
                </Button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

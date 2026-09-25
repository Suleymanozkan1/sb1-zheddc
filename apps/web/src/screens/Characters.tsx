import { StatKey, type BalancesDto, type CharacterDto } from "@cryptoarena/shared";
import { Button, Panel, RarityBadge, Spinner } from "@cryptoarena/ui";
import { useState } from "react";
import { Avatar, CharacterCard, StatsGrid } from "../components/CharacterCard";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { price } from "../lib/format";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

const STAT_LABEL: Record<StatKey, string> = { HP: "Health", DAMAGE: "Damage", ARMOR: "Armor", SPEED: "Speed", ATTACK_SPEED: "Attack speed", CRIT_CHANCE: "Crit chance" };

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

  return (
    <Page title="Characters" subtitle="Five classes, levels 1–50. Level up to earn stat points, then invest gold to raise stats.">
      {chars.loading && !chars.data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((c) => (
              <CharacterCard key={c.key} c={c} selected={current?.key === c.key} onClick={() => setFocus(c.key)} />
            ))}
          </div>
          {current && (
            <Panel title={current.name} actions={<RarityBadge rarity={current.rarity} />}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Avatar keyName={current.key} size={90} />
                  <div className="text-sm text-slate-300">
                    <p>{current.description}</p>
                    <p className="mt-2 text-xs text-cyan-200">
                      [Q] {current.skill.name} — {current.skill.description} ({current.skill.cooldownMs / 1000}s)
                    </p>
                    <p className="text-xs text-fuchsia-200">
                      [R] {current.ultimate.name} — {current.ultimate.description} ({current.ultimate.cooldownMs / 1000}s)
                    </p>
                  </div>
                </div>
                <StatsGrid c={current} />
                {current.owned && current.progress ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        Stat points: <b className="text-cyan-300">{current.progress.statPoints}</b>
                      </span>
                      <Button variant={current.progress.userCharacterId === selectedCharacterId ? "success" : "primary"} onClick={() => selectCharacter(current.progress!.userCharacterId)}>
                        {current.progress.userCharacterId === selectedCharacterId ? "Selected" : "Select for battle"}
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {StatKey.map((k) => (
                        <div key={k} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                          <span>
                            {STAT_LABEL[k]} <span className="text-cyan-300">+{current.progress!.upgrades[k]}</span>
                          </span>
                          <Button
                            size="sm"
                            disabled={current.progress!.statPoints < 1}
                            loading={busy === k}
                            onClick={() => act(k, () => api.upgradeCharacter(current.progress!.userCharacterId, k), `${STAT_LABEL[k]} upgraded`)}
                          >
                            +1 · {current.progress!.upgradeCosts[k]} 🪙
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : current.unlockProduct ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" loading={busy === "unlock"} onClick={() => act("unlock", () => api.unlockCharacter(current.key, current.unlockProduct!.sku), `${current.name} unlocked!`)}>
                      Unlock for {price(current.unlockProduct.price, current.unlockProduct.currency, me?.balances)}
                    </Button>
                    <p className="w-full text-xs text-slate-400">More unlock options are available in the Shop.</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Not available right now.</p>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}
    </Page>
  );
}

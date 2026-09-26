import { ItemType, type InventoryItemDto } from "@cryptoarena/shared";
import { Button, Empty, Panel, Spinner, cx } from "@cryptoarena/ui";
import { RARITY_COLORS } from "@cryptoarena/shared";
import { useState } from "react";
import { Page } from "../components/Layout";
import { RarityTag } from "../components/RarityTag";
import { useT, useTc } from "../lib/i18n";
import { api } from "../lib/api";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

const STAT_NAMES: Record<string, string> = { damage: "DMG", armor: "ARM", hp: "HP", speed: "SPD", critChance: "CRIT", critDamage: "CDMG", attackSpeed: "ATK/S", lifesteal: "LS", range: "RNG" };

function fmtStat(k: string, v: number): string {
  return ["critChance", "lifesteal"].includes(k) ? `${(v * 100).toFixed(1)}%` : k === "critDamage" || k === "attackSpeed" ? `+${v.toFixed(2)}` : `+${Math.round(v)}`;
}

export function Inventory() {
  const { setBalances, toast } = useApp();
  const inv = useAsync(() => api.inventory(), []);
  const t = useT();
  const tc = useTc();
  const [filter, setFilter] = useState<string>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const items = (inv.data?.items ?? []).filter((i) => filter === "ALL" || i.item.type === filter);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      const res = (await fn()) as { balances?: Parameters<typeof setBalances>[0] };
      if (res?.balances) setBalances(res.balances);
      await inv.reload();
      toast("success", ok);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const equipped = (inv.data?.items ?? []).filter((i) => i.equipped);

  return (
    <Page title={t("Inventory")} subtitle={inv.data ? t("{used} / {slots} slots used", { used: inv.data.items.length, slots: inv.data.slots }) : undefined}>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-1">
            {["ALL", ...ItemType].map((type) => (
              <button key={type} onClick={() => setFilter(type)} className={cx("rounded-lg px-3 py-1 text-xs font-semibold", filter === type ? "bg-cyan-400 text-black" : "bg-white/5 text-slate-300")}>
                {type === "ALL" ? t("All") : tc("itemType", type, type)}
              </button>
            ))}
          </div>
          {inv.loading && !inv.data ? (
            <Spinner />
          ) : items.length === 0 ? (
            <Empty>{t("No items yet — defeat creatures and open chests to find loot.")}</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i: InventoryItemDto) => (
                <div key={i.id} className="glass flex flex-col gap-2 p-3" style={{ borderColor: `${RARITY_COLORS[i.item.rarity]}55` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold" style={{ color: RARITY_COLORS[i.item.rarity] }}>
                        {tc("item", i.item.key, i.item.name)} {i.upgradeLevel > 0 && <span className="text-amber-300">+{i.upgradeLevel}</span>}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {tc("itemType", i.item.type, i.item.type)} · {t("Lv")} {i.item.levelRequirement}+ {i.quantity > 1 && `· x${i.quantity}`}
                      </p>
                    </div>
                    <RarityTag rarity={i.item.rarity} />
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {Object.entries(i.effectiveStats).map(([k, v]) => (
                      <span key={k} className="rounded bg-white/5 px-1.5 py-0.5">
                        {t(STAT_NAMES[k] ?? k)} {fmtStat(k, v as number)}
                      </span>
                    ))}
                    {Object.keys(i.effectiveStats).length === 0 && <span className="text-slate-500">{tc("itemDesc", i.item.key, i.item.description)}</span>}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {i.item.type !== "CONSUMABLE" &&
                      (i.equipped ? (
                        <Button size="sm" loading={busy === i.id} onClick={() => run(i.id, () => api.unequip(i.id), t("Unequipped"))}>
                          {t("Unequip")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" loading={busy === i.id} onClick={() => run(i.id, () => api.equip(i.id), t("{name} equipped", { name: tc("item", i.item.key, i.item.name) }))}>
                          {t("Equip")}
                        </Button>
                      ))}
                    {i.nextUpgradeCost && i.item.maxUpgrade > 0 && (
                      <Button size="sm" loading={busy === `u${i.id}`} onClick={() => run(`u${i.id}`, () => api.upgradeItem(i.id), t("{name} upgraded", { name: tc("item", i.item.key, i.item.name) }))}>
                        {t("Upgrade")} · {i.nextUpgradeCost} 🪙
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Panel title={t("Equipped")}>
          {equipped.length === 0 ? (
            <p className="text-sm text-slate-400">{t("Nothing equipped.")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {equipped.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[11px] text-slate-400">{i.equippedSlot?.startsWith("SKIN:") ? tc("itemType", "SKIN", "SKIN") : tc("itemType", i.equippedSlot ?? "", i.equippedSlot ?? "")}</span>
                  <span style={{ color: RARITY_COLORS[i.item.rarity] }}>
                    {tc("item", i.item.key, i.item.name)}
                    {i.upgradeLevel > 0 && ` +${i.upgradeLevel}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-500">{t("Equipment applies to every character. Skins are per character. Changes apply when you next join a match (or instantly via in-game equip).")}</p>
        </Panel>
      </div>
    </Page>
  );
}

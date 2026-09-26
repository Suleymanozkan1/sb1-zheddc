import { ItemType, RARITY_COLORS, Rarity, type InventoryItemDto } from "@cryptoarena/shared";
import { Button, Empty, Modal, Panel, Spinner, cx, formatInt } from "@cryptoarena/ui";
import { useMemo, useState } from "react";
import { Page } from "../components/Layout";
import { RarityTag } from "../components/RarityTag";
import { api } from "../lib/api";
import { useT, useTc } from "../lib/i18n";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

const STAT_NAMES: Record<string, string> = { damage: "DMG", armor: "ARM", hp: "HP", speed: "SPD", critChance: "CRIT", critDamage: "CDMG", attackSpeed: "ATK/S", lifesteal: "LS", range: "RNG" };

function fmtStat(k: string, v: number): string {
  return ["critChance", "lifesteal"].includes(k) ? `${(v * 100).toFixed(1)}%` : k === "critDamage" || k === "attackSpeed" ? `+${v.toFixed(2)}` : `+${Math.round(v)}`;
}

type Tab = "inventory" | "stash";

/** Items that bulk selling may include: unlocked, unequipped, sellable gear (never consumables). */
function bulkCandidate(i: InventoryItemDto, maxRarity: Rarity): boolean {
  return i.sellValue !== null && !i.locked && !i.equipped && i.item.type !== "CONSUMABLE" && Rarity.indexOf(i.item.rarity) <= Rarity.indexOf(maxRarity);
}

/** Selling something valuable or upgraded asks for confirmation first. */
function needsConfirm(i: InventoryItemDto): boolean {
  return i.upgradeLevel > 0 || Rarity.indexOf(i.item.rarity) >= Rarity.indexOf("RARE");
}

interface SellPlan {
  items: InventoryItemDto[];
  gold: number;
}

export function Inventory() {
  const { setBalances, toast } = useApp();
  const inv = useAsync(() => api.inventory(), []);
  const t = useT();
  const tc = useTc();
  const [tab, setTab] = useState<Tab>("inventory");
  const [filter, setFilter] = useState<string>("ALL");
  const [bulkRarity, setBulkRarity] = useState<Rarity>("COMMON");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SellPlan | null>(null);

  const all = inv.data?.items ?? [];
  const inBag = all.filter((i) => !i.inStash);
  const inStash = all.filter((i) => i.inStash);
  const shown = (tab === "stash" ? inStash : inBag).filter((i) => filter === "ALL" || i.item.type === filter);
  const equipped = inBag.filter((i) => i.equipped);
  const name = (i: InventoryItemDto) => tc("item", i.item.key, i.item.name);

  const bulk = useMemo<SellPlan>(() => {
    const items = (tab === "stash" ? inStash : inBag).filter((i) => bulkCandidate(i, bulkRarity));
    return { items, gold: items.reduce((n, i) => n + Number(i.sellValue ?? 0), 0) };
  }, [tab, inBag, inStash, bulkRarity]);

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

  const sell = (plan: SellPlan) =>
    run(
      plan.items.length === 1 ? `s${plan.items[0]!.id}` : "bulk",
      async () => {
        const res = await api.sellItems(plan.items.map((i) => i.id));
        setConfirm(null);
        return res;
      },
      plan.items.length === 1 ? t("Sold {name} for {gold} gold", { name: name(plan.items[0]!), gold: formatInt(plan.gold) }) : t("Sold {n} items for {gold} gold", { n: plan.items.length, gold: formatInt(plan.gold) }),
    );

  const sellOne = (i: InventoryItemDto) => {
    const plan = { items: [i], gold: Number(i.sellValue ?? 0) };
    if (needsConfirm(i)) setConfirm(plan);
    else void sell(plan);
  };

  const subtitle = inv.data
    ? t("Inventory {used} / {slots} · Stash {stashUsed} / {stashSlots}", { used: inBag.length, slots: inv.data.slots, stashUsed: inStash.length, stashSlots: inv.data.stashSlots })
    : undefined;
  const bagFull = !!inv.data && inBag.length >= inv.data.slots;

  return (
    <Page title={t("Inventory")} subtitle={subtitle}>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["inventory", "stash"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cx("rounded-lg px-4 py-1.5 font-display text-xs font-bold tracking-wider", tab === k ? "bg-cyan-400 text-black" : "bg-white/5 text-slate-300")}
              >
                {k === "inventory" ? `🎒 ${t("Inventory")} (${inBag.length})` : `📦 ${t("Stash")} (${inStash.length})`}
              </button>
            ))}
            {bagFull && tab === "inventory" && <span className="text-xs font-semibold text-amber-300">{t("Inventory is full — sell items or move them to the stash.")}</span>}
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {["ALL", ...ItemType].map((type) => (
              <button key={type} onClick={() => setFilter(type)} className={cx("rounded-lg px-3 py-1 text-xs font-semibold", filter === type ? "bg-white/20 text-white" : "bg-white/5 text-slate-300")}>
                {type === "ALL" ? t("All") : tc("itemType", type, type)}
              </button>
            ))}
          </div>

          {/* Bulk sell */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
            <span className="text-slate-300">{t("Sell all unlocked gear up to")}</span>
            <select value={bulkRarity} onChange={(e) => setBulkRarity(e.target.value as Rarity)} className="rounded-md bg-slate-900 px-2 py-1 text-sm" aria-label={t("Rarity")}>
              {Rarity.map((r) => (
                <option key={r} value={r}>
                  {tc("rarity", r, r)}
                </option>
              ))}
            </select>
            <Button size="sm" variant="danger" disabled={bulk.items.length === 0} loading={busy === "bulk"} onClick={() => setConfirm(bulk)}>
              {t("Sell {n} items · {gold} gold", { n: bulk.items.length, gold: formatInt(bulk.gold) })}
            </Button>
            <span className="text-[11px] text-slate-500">{t("Locked, equipped items, skins and consumables are never included.")}</span>
          </div>

          {inv.loading && !inv.data ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <Empty>{tab === "stash" ? t("Your stash is empty. Move items here to free inventory slots.") : t("No items yet — defeat creatures and open chests to find loot.")}</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((i) => (
                <div key={i.id} className={cx("glass flex flex-col gap-2 p-3", i.locked && "ring-1 ring-amber-300/40")} style={{ borderColor: `${RARITY_COLORS[i.item.rarity]}55` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold" style={{ color: RARITY_COLORS[i.item.rarity] }}>
                        {name(i)} {i.upgradeLevel > 0 && <span className="text-amber-300">+{i.upgradeLevel}</span>}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {tc("itemType", i.item.type, i.item.type)} · {t("Lv")} {i.item.levelRequirement}+ {i.quantity > 1 && `· x${i.quantity}`}
                        {i.equipped && <span className="ml-1 text-emerald-300">· {t("Equipped")}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        title={i.locked ? t("Unlock") : t("Lock")}
                        aria-label={i.locked ? t("Unlock") : t("Lock")}
                        aria-pressed={i.locked}
                        onClick={() => void run(`l${i.id}`, () => api.lockItem(i.id, !i.locked), i.locked ? t("{name} unlocked", { name: name(i) }) : t("{name} locked", { name: name(i) }))}
                        className={cx("grid h-7 w-7 place-items-center rounded-md text-sm", i.locked ? "bg-amber-400/20" : "bg-white/5 opacity-60 hover:opacity-100")}
                      >
                        {i.locked ? "🔒" : "🔓"}
                      </button>
                      <RarityTag rarity={i.item.rarity} />
                    </div>
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
                    {!i.inStash &&
                      i.item.type !== "CONSUMABLE" &&
                      (i.equipped ? (
                        <Button size="sm" loading={busy === i.id} onClick={() => run(i.id, () => api.unequip(i.id), t("Unequipped"))}>
                          {t("Unequip")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" loading={busy === i.id} onClick={() => run(i.id, () => api.equip(i.id), t("{name} equipped", { name: name(i) }))}>
                          {t("Equip")}
                        </Button>
                      ))}
                    {i.nextUpgradeCost && i.item.maxUpgrade > 0 && (
                      <Button size="sm" loading={busy === `u${i.id}`} onClick={() => run(`u${i.id}`, () => api.upgradeItem(i.id), t("{name} upgraded", { name: name(i) }))}>
                        {t("Upgrade")} · {i.nextUpgradeCost} 🪙
                      </Button>
                    )}
                    {!i.equipped && (
                      <Button
                        size="sm"
                        loading={busy === `m${i.id}`}
                        onClick={() => run(`m${i.id}`, () => api.moveItem(i.id, i.inStash ? "inventory" : "stash"), i.inStash ? t("{name} moved to the inventory", { name: name(i) }) : t("{name} moved to the stash", { name: name(i) }))}
                      >
                        {i.inStash ? `🎒 ${t("Take out")}` : `📦 ${t("Store")}`}
                      </Button>
                    )}
                    {i.sellValue !== null && (
                      <Button size="sm" variant="danger" disabled={i.locked} loading={busy === `s${i.id}`} title={i.locked ? t("Unlock the item to sell it") : undefined} onClick={() => sellOne(i)}>
                        {t("Sell")} · {formatInt(i.sellValue)} 🪙
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
                    {name(i)}
                    {i.upgradeLevel > 0 && ` +${i.upgradeLevel}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-500">{t("Equipment applies to every character. Skins are per character. Changes apply when you next join a match (or instantly via in-game equip).")}</p>
          <p className="mt-2 text-[11px] text-slate-500">{t("The stash keeps items without using inventory slots. Stashed items cannot be equipped or used in the arena. More stash space is sold in the Shop.")}</p>
        </Panel>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t("Sell items?")}>
        {confirm && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-300">{t("You will receive {gold} gold. Sold items are gone for good.", { gold: formatInt(confirm.gold) })}</p>
            <ul className="max-h-60 overflow-y-auto rounded-lg bg-white/5 p-2 text-sm">
              {confirm.items.map((i) => (
                <li key={i.id} className="flex justify-between px-1 py-0.5">
                  <span style={{ color: RARITY_COLORS[i.item.rarity] }}>
                    {name(i)}
                    {i.upgradeLevel > 0 && ` +${i.upgradeLevel}`}
                    {i.quantity > 1 && ` x${i.quantity}`}
                  </span>
                  <span className="text-amber-300">{formatInt(i.sellValue ?? "0")} 🪙</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirm(null)}>{t("Cancel")}</Button>
              <Button variant="danger" loading={busy === "bulk" || busy === `s${confirm.items[0]?.id}`} onClick={() => void sell(confirm)}>
                {t("Sell for {gold} gold", { gold: formatInt(confirm.gold) })}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

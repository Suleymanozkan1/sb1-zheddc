// In-browser stand-in for the REST API, backed by the local demo profile. Same signatures as the
// live client so screens need no demo branches. Crypto features are unavailable in the demo.
import { getCharacterDef, itemUpgradeCost } from "@cryptoarena/game-core";
import { StatKey, type LeaderboardDto, type LeaderboardRowDto, type LeaderboardScope, type QuestDto, type ShopProductDto } from "@cryptoarena/shared";
import type { Api } from "../lib/api";
import { setDemo } from "../lib/demo";
import { DEMO_PRODUCTS, DEMO_QUESTS, DEMO_RIVALS, DEMO_SELL_MAX_ITEMS } from "./catalog";
import {
  DemoError,
  balancesOf,
  charactersOf,
  clearProfile,
  createProfile,
  findCharacter,
  grantItem,
  inventoryRowDto,
  itemDef,
  loadProfile,
  maxCharacterLevel,
  meOf,
  requireProfile,
  saveProfile,
  sellValueOf,
  slotFor,
  stashSlotsOf,
  usedSlots,
  spend,
  unlockCharacter,
  type DemoProfile,
} from "./profile";

const unavailable = (): Promise<never> => Promise.reject(new DemoError("Wallets and crypto are not available in the demo"));

/** Runs a mutation on the profile and saves it only when the mutation succeeds. */
function mutate<T>(fn: (p: DemoProfile) => T): Promise<T> {
  try {
    const p = structuredClone(requireProfile());
    const out = fn(p);
    saveProfile(p);
    return Promise.resolve(out);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new DemoError("Something went wrong"));
  }
}

function read<T>(fn: (p: DemoProfile) => T): Promise<T> {
  try {
    return Promise.resolve(fn(requireProfile()));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new DemoError("Something went wrong"));
  }
}

function productDto(p: DemoProfile, x: (typeof DEMO_PRODUCTS)[number]): ShopProductDto {
  const owned = x.grants.some((g) => g.kind === "CHARACTER" && !!p.characters[g.characterKey]) || (!!x.perUserLimit && (p.purchases[x.sku] ?? 0) >= x.perUserLimit);
  return { id: x.sku, sku: x.sku, name: x.name, description: x.description, category: x.category, price: String(x.price), currency: x.currency, rarity: x.rarity, metadata: { grants: x.grants }, owned };
}

function buy(p: DemoProfile, sku: string): void {
  const x = DEMO_PRODUCTS.find((d) => d.sku === sku);
  if (!x) throw new DemoError("Product not found");
  if (x.perUserLimit && (p.purchases[sku] ?? 0) >= x.perUserLimit) throw new DemoError("Purchase limit reached");
  for (const g of x.grants) if (g.kind === "CHARACTER" && p.characters[g.characterKey]) throw new DemoError("You already own this character");
  spend(p, x.currency, x.price);
  for (const g of x.grants) {
    if (g.kind === "ITEM") grantItem(p, g.itemKey, g.quantity);
    else if (g.kind === "CHARACTER") unlockCharacter(p, g.characterKey);
    else if (g.kind === "INVENTORY_SLOTS") p.slots += g.amount;
    else if (g.kind === "STASH_SLOTS") p.stashSlots = stashSlotsOf(p) + g.amount;
    else if (g.kind === "GOLD") p.gold += g.amount;
    else if (g.kind === "GEMS") p.gems += g.amount;
  }
  p.purchases[sku] = (p.purchases[sku] ?? 0) + 1;
}

function leaderboard(p: DemoProfile, scope: LeaderboardScope): LeaderboardDto {
  // Fixed rivals so the table is stable; the player's row uses real demo totals.
  const rivals: Omit<LeaderboardRowDto, "rank">[] = DEMO_RIVALS.map((name, i) => {
    const kills = 60 - i * 6;
    return { userId: `rival-${i}`, username: name, kills, xp: 24_000 - i * 2_300, wins: Math.max(0, 9 - i), arenaScore: kills * 10 + (9 - i) * 25, score: 0 };
  });
  const self = { userId: p.id, username: p.username, kills: p.totals.kills, xp: p.totals.xp, wins: 0, arenaScore: p.totals.kills * 10 + p.totals.npcKills * 2, score: 0 };
  const rows = [...rivals, self]
    .map((r) => ({ ...r, score: r.arenaScore }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { scope, periodKey: "demo", rows, me: rows.find((r) => r.userId === p.id) ?? null };
}

function questsOf(p: DemoProfile): QuestDto[] {
  return DEMO_QUESTS.map((q) => {
    const s = p.quests[q.key] ?? { progress: 0, claimed: false };
    return {
      key: q.key,
      name: q.name,
      description: q.description,
      period: "DAILY",
      objective: q.objective,
      target: q.target,
      progress: s.progress,
      completed: s.progress >= q.target,
      claimed: s.claimed,
      locked: false,
      rewards: { gold: String(q.gold), gems: String(q.gems), xp: 0, crypto: "0" },
    };
  });
}

export const demoApi: Api = {
  me: () => read(meOf),
  profile: () => read((p) => ({ ...meOf(p), stats: { ...p.totals } })),
  nonce: unavailable,
  verify: unavailable,
  guest: () => Promise.resolve(meOf(loadProfile() ?? createProfile())),
  logout: () => {
    clearProfile();
    setDemo(false);
    return Promise.resolve({ ok: true });
  },
  linkWallet: unavailable,

  characters: () => read(charactersOf),
  unlockCharacter: (characterKey, sku) =>
    mutate((p) => {
      getCharacterDef(characterKey);
      const product = DEMO_PRODUCTS.find((x) => x.sku === sku && x.grants.some((g) => g.kind === "CHARACTER" && g.characterKey === characterKey));
      if (!product) throw new DemoError("This character cannot be unlocked with that product");
      buy(p, product.sku);
      return { characters: charactersOf(p), balances: balancesOf(p) };
    }),
  upgradeCharacter: (userCharacterId, stat) =>
    mutate((p) => {
      if (!StatKey.includes(stat)) throw new DemoError("Unknown stat");
      const { uc } = findCharacter(p, userCharacterId);
      if (uc.statPoints < 1) throw new DemoError("No stat points available — level up to earn more");
      const cost = Number(charactersOf(p).find((c) => c.progress?.userCharacterId === userCharacterId)?.progress?.upgradeCosts[stat] ?? "0");
      spend(p, "GOLD", cost);
      uc.statPoints--;
      uc.upgrades[stat]++;
      return { characters: charactersOf(p), balances: balancesOf(p) };
    }),

  inventory: () => read((p) => ({ slots: p.slots, stashSlots: stashSlotsOf(p), items: p.inventory.map(inventoryRowDto) })),
  sellItems: (inventoryItemIds) =>
    mutate((p) => {
      const ids = [...new Set(inventoryItemIds)];
      if (ids.length === 0) throw new DemoError("Nothing to sell");
      if (ids.length > DEMO_SELL_MAX_ITEMS) throw new DemoError(`You can sell at most ${DEMO_SELL_MAX_ITEMS} items at once`);
      let gold = 0;
      for (const id of ids) {
        const row = p.inventory.find((r) => r.id === id);
        if (!row) throw new DemoError("Item not found in your inventory");
        const name = itemDef(row.itemKey).name;
        if (row.locked) throw new DemoError(`${name} is locked`);
        if (row.equipped) throw new DemoError(`Unequip ${name} before selling it`);
        const value = sellValueOf(row);
        if (value === null) throw new DemoError(`${name} cannot be sold`);
        gold += value;
      }
      p.inventory = p.inventory.filter((r) => !ids.includes(r.id));
      p.gold += gold;
      return { sold: ids.length, gold: String(gold), balances: balancesOf(p) };
    }),
  lockItem: (inventoryItemId, locked) =>
    mutate((p) => {
      const row = p.inventory.find((r) => r.id === inventoryItemId);
      if (!row) throw new DemoError("Item not found in your inventory");
      row.locked = locked;
      return { ok: true };
    }),
  moveItem: (inventoryItemId, to) =>
    mutate((p) => {
      const row = p.inventory.find((r) => r.id === inventoryItemId);
      if (!row) throw new DemoError("Item not found in your inventory");
      const toStash = to === "stash";
      if (!!row.inStash === toStash) return { ok: true };
      if (row.equipped) throw new DemoError("Unequip the item before storing it");
      const def = itemDef(row.itemKey);
      // A stack joins an existing stack at the destination without using a new slot.
      const target = def.stackable ? p.inventory.find((r) => r.itemKey === row.itemKey && !!r.inStash === toStash) : undefined;
      if (target) {
        target.quantity = Math.min(def.maxStack, target.quantity + row.quantity);
        target.locked = !!target.locked || !!row.locked;
        p.inventory = p.inventory.filter((r) => r !== row);
        return { ok: true };
      }
      const capacity = toStash ? stashSlotsOf(p) : p.slots;
      if (usedSlots(p, toStash) >= capacity) throw new DemoError(toStash ? "Stash is full" : "Inventory is full");
      row.inStash = toStash;
      return { ok: true };
    }),
  equip: (inventoryItemId) =>
    mutate((p) => {
      const row = p.inventory.find((r) => r.id === inventoryItemId);
      if (!row) throw new DemoError("Item not found in your inventory");
      const def = itemDef(row.itemKey);
      const slot = slotFor(def);
      if (!slot) throw new DemoError("This item cannot be equipped");
      if (row.inStash) throw new DemoError("Take the item out of the stash first");
      if (def.levelRequirement > maxCharacterLevel(p)) throw new DemoError(`Requires level ${def.levelRequirement}`);
      for (const r of p.inventory) {
        if (r.equipped && r.equippedSlot === slot) {
          r.equipped = false;
          r.equippedSlot = null;
        }
      }
      row.equipped = true;
      row.equippedSlot = slot;
      return inventoryRowDto(row);
    }),
  unequip: (inventoryItemId) =>
    mutate((p) => {
      const row = p.inventory.find((r) => r.id === inventoryItemId);
      if (!row) throw new DemoError("Item not found in your inventory");
      row.equipped = false;
      row.equippedSlot = null;
      return inventoryRowDto(row);
    }),
  upgradeItem: (inventoryItemId) =>
    mutate((p) => {
      const row = p.inventory.find((r) => r.id === inventoryItemId);
      if (!row) throw new DemoError("Item not found in your inventory");
      const def = itemDef(row.itemKey);
      const cost = def.maxUpgrade > row.upgradeLevel ? itemUpgradeCost(def.rarity, row.upgradeLevel) : null;
      if (cost === null) throw new DemoError("This item is fully upgraded");
      spend(p, "GOLD", Number(cost));
      row.upgradeLevel++;
      return { item: inventoryRowDto(row), balances: balancesOf(p) };
    }),

  shop: () => read((p) => DEMO_PRODUCTS.map((x) => productDto(p, x))),
  purchase: (sku, quantity = 1) =>
    mutate((p) => {
      for (let i = 0; i < Math.max(1, Math.min(10, Math.floor(quantity))); i++) buy(p, sku);
      return { purchaseId: crypto.randomUUID(), balances: balancesOf(p) };
    }),

  leaderboard: (scope) => read((p) => leaderboard(p, scope)),
  quests: () => read(questsOf),
  claimQuest: (questKey) =>
    mutate((p) => {
      const q = DEMO_QUESTS.find((x) => x.key === questKey);
      const s = q ? p.quests[q.key] : undefined;
      if (!q || !s || s.progress < q.target) throw new DemoError("Quest not completed yet");
      if (s.claimed) throw new DemoError("Already claimed");
      s.claimed = true;
      p.gold += q.gold;
      p.gems += q.gems;
      const rewards = [
        { status: "GRANTED", amount: String(q.gold), reason: null },
        ...(q.gems > 0 ? [{ status: "GRANTED", amount: String(q.gems), reason: null }] : []),
      ];
      return { rewards, balances: balancesOf(p) };
    }),

  wallet: unavailable,
  ledger: unavailable,
  prepareDeposit: unavailable,
  mockSendDeposit: unavailable,
  verifyDeposit: unavailable,
  withdraw: unavailable,
  cancelWithdrawal: unavailable,

  gameTicket: (userCharacterId) =>
    read((p) => {
      findCharacter(p, userCharacterId);
      return { ticket: "demo" };
    }),
};

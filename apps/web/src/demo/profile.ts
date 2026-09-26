// The demo account: a single profile kept in localStorage. It stands in for the database the
// real API uses, so the demo keeps its own copy of the rules (levels, stat points, upgrades).
import {
  CHARACTERS,
  MAX_LEVEL,
  buildItemCatalog,
  computeCombatStats,
  getCharacterDef,
  itemUpgradeCost,
  levelFromXp,
  levelProgress,
  scaleItemStats,
  statPointsForLevels,
  statUpgradeGoldCost,
  type EquippedItemInput,
  type ItemDef,
} from "@cryptoarena/game-core";
import { EquipSlots, StatKey, type BalancesDto, type CharacterDto, type InventoryItemDto, type MeDto } from "@cryptoarena/shared";
import { DEMO_PRODUCTS, DEMO_QUESTS, DEMO_START, type DemoObjective } from "./catalog";

interface DemoCharacter {
  id: string;
  xp: number;
  level: number;
  statPoints: number;
  upgrades: Record<StatKey, number>;
}

interface DemoInventoryRow {
  id: string;
  itemKey: string;
  quantity: number;
  upgradeLevel: number;
  equipped: boolean;
  equippedSlot: string | null;
  acquiredAt: string;
}

export interface DemoProfile {
  version: 1;
  id: string;
  username: string;
  createdAt: string;
  gold: number;
  gems: number;
  slots: number;
  characters: Record<string, DemoCharacter>;
  inventory: DemoInventoryRow[];
  purchases: Record<string, number>;
  /** Quest progress for `questDay`; resets daily like the live daily quests. */
  questDay: string;
  quests: Record<string, { progress: number; claimed: boolean }>;
  totals: { kills: number; npcKills: number; xp: number; matches: number };
}

const KEY = "ca.demo.profile";
const ITEMS: readonly ItemDef[] = buildItemCatalog();

export class DemoError extends Error {}

export function itemDef(key: string): ItemDef {
  const def = ITEMS.find((i) => i.key === key);
  if (!def) throw new DemoError(`Unknown item ${key}`);
  return def;
}

export function lootCatalog() {
  return ITEMS.filter((i) => i.dropWeight > 0).map((i) => ({ key: i.key, rarity: i.rarity, type: i.type, dropWeight: i.dropWeight, name: i.name }));
}

const uid = (): string => crypto.randomUUID();
const today = (): string => new Date().toISOString().slice(0, 10);
const noUpgrades = (): Record<StatKey, number> => Object.fromEntries(StatKey.map((k) => [k, 0])) as Record<StatKey, number>;

function newCharacter(): DemoCharacter {
  return { id: uid(), xp: 0, level: 1, statPoints: 0, upgrades: noUpgrades() };
}

function freshProfile(): DemoProfile {
  const n = Math.floor(1000 + Math.random() * 9000);
  const characters: Record<string, DemoCharacter> = {};
  for (const c of CHARACTERS) if (c.isStarter) characters[c.key] = newCharacter();
  return {
    version: 1,
    id: uid(),
    username: `Guest${n}`,
    createdAt: new Date().toISOString(),
    gold: DEMO_START.gold,
    gems: DEMO_START.gems,
    slots: DEMO_START.slots,
    characters,
    inventory: [{ id: uid(), itemKey: "potion_health", quantity: DEMO_START.potions, upgradeLevel: 0, equipped: false, equippedSlot: null, acquiredAt: new Date().toISOString() }],
    purchases: {},
    questDay: today(),
    quests: {},
    totals: { kills: 0, npcKills: 0, xp: 0, matches: 0 },
  };
}

let cache: DemoProfile | null = null;

export function loadProfile(): DemoProfile | null {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoProfile) : null;
    cache = parsed?.version === 1 ? parsed : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveProfile(p: DemoProfile): void {
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this page load */
  }
}

export function createProfile(): DemoProfile {
  const p = freshProfile();
  saveProfile(p);
  return p;
}

export function clearProfile(): void {
  cache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function requireProfile(): DemoProfile {
  const p = loadProfile();
  if (!p) throw new DemoError("Start the demo first");
  if (p.questDay !== today()) {
    p.questDay = today();
    p.quests = {};
  }
  return p;
}

// ───────────────────────── DTOs ─────────────────────────

export function balancesOf(p: DemoProfile): BalancesDto {
  return { gold: String(p.gold), gems: String(p.gems), cryptoSpendable: "0", cryptoReward: "0", cryptoDecimals: 6, cryptoSymbol: "ARENA" };
}

export function meOf(p: DemoProfile): MeDto {
  return { id: p.id, username: p.username, isGuest: true, premiumTier: "FREE", premiumUntil: null, wallets: [], adminRole: null, balances: balancesOf(p), createdAt: p.createdAt };
}

function equippedCombatItems(p: DemoProfile): EquippedItemInput[] {
  return p.inventory
    .filter((r) => r.equipped)
    .map((r) => ({ def: itemDef(r.itemKey), r }))
    .filter(({ def }) => def.type !== "SKIN" && def.type !== "CONSUMABLE")
    .map(({ def, r }) => ({ stats: def.stats, upgradeLevel: r.upgradeLevel }));
}

export function charactersOf(p: DemoProfile): CharacterDto[] {
  const equipped = equippedCombatItems(p);
  return CHARACTERS.map((def) => {
    const uc = p.characters[def.key];
    const product = DEMO_PRODUCTS.find((x) => x.currency === "GEMS" && x.grants.some((g) => g.kind === "CHARACTER" && g.characterKey === def.key));
    const skill = (a: typeof def.skill) => ({ key: a.key, name: a.name, description: a.description, cooldownMs: a.cooldownMs });
    let progress: CharacterDto["progress"] = null;
    if (uc) {
      const lp = levelProgress(uc.xp);
      progress = {
        userCharacterId: uc.id,
        level: uc.level,
        xp: uc.xp,
        xpIntoLevel: lp.xpIntoLevel,
        xpForNext: lp.xpForNext,
        statPoints: uc.statPoints,
        upgrades: uc.upgrades,
        upgradeCosts: Object.fromEntries(StatKey.map((k) => [k, statUpgradeGoldCost(k, uc.upgrades[k]).toString()])) as Record<StatKey, string>,
        stats: computeCombatStats(def.base, uc.level, uc.upgrades, equipped),
      };
    }
    return {
      key: def.key,
      name: def.name,
      class: def.class,
      rarity: def.rarity,
      description: def.description,
      skill: skill(def.skill),
      ultimate: skill(def.ultimate),
      base: computeCombatStats(def.base, 1, {}, []),
      owned: !!uc,
      isStarter: def.isStarter,
      unlockProduct: product ? { sku: product.sku, price: String(product.price), currency: product.currency } : null,
      progress,
    };
  });
}

export function inventoryRowDto(r: DemoInventoryRow): InventoryItemDto {
  const def = itemDef(r.itemKey);
  const cost = def.maxUpgrade > r.upgradeLevel ? itemUpgradeCost(def.rarity, r.upgradeLevel) : null;
  return {
    id: r.id,
    item: { key: def.key, name: def.name, description: def.description, type: def.type, rarity: def.rarity, stats: def.stats, stackable: def.stackable, maxUpgrade: def.maxUpgrade, levelRequirement: def.levelRequirement },
    quantity: r.quantity,
    upgradeLevel: r.upgradeLevel,
    equipped: r.equipped,
    equippedSlot: r.equippedSlot,
    effectiveStats: scaleItemStats(def.stats, r.upgradeLevel),
    nextUpgradeCost: cost === null ? null : cost.toString(),
    acquiredAt: r.acquiredAt,
  };
}

// ───────────────────────── Mutations ─────────────────────────

function usedSlots(p: DemoProfile): number {
  return p.inventory.filter((r) => !itemDef(r.itemKey).stackable).length + new Set(p.inventory.filter((r) => itemDef(r.itemKey).stackable).map((r) => r.itemKey)).size;
}

/** Adds an item; returns the row. Throws when a new slot is needed and the inventory is full. */
export function grantItem(p: DemoProfile, itemKey: string, quantity: number): DemoInventoryRow {
  const def = itemDef(itemKey);
  if (def.stackable) {
    const row = p.inventory.find((r) => r.itemKey === itemKey);
    if (row) {
      row.quantity = Math.min(def.maxStack, row.quantity + quantity);
      return row;
    }
  }
  if (usedSlots(p) >= p.slots) throw new DemoError("Inventory is full");
  const row: DemoInventoryRow = { id: uid(), itemKey, quantity: def.stackable ? Math.min(def.maxStack, quantity) : 1, upgradeLevel: 0, equipped: false, equippedSlot: null, acquiredAt: new Date().toISOString() };
  p.inventory.push(row);
  return row;
}

export function consumeItem(p: DemoProfile, itemKey: string): boolean {
  const row = p.inventory.find((r) => r.itemKey === itemKey && r.quantity > 0);
  if (!row) return false;
  row.quantity--;
  if (row.quantity <= 0) p.inventory = p.inventory.filter((r) => r !== row);
  return true;
}

export function countItem(p: DemoProfile, itemKey: string): number {
  return p.inventory.filter((r) => r.itemKey === itemKey).reduce((n, r) => n + r.quantity, 0);
}

export function spend(p: DemoProfile, currency: "GOLD" | "GEMS", amount: number): void {
  if (currency === "GOLD") {
    if (p.gold < amount) throw new DemoError("Not enough gold");
    p.gold -= amount;
  } else {
    if (p.gems < amount) throw new DemoError("Not enough gems");
    p.gems -= amount;
  }
}

export function slotFor(def: ItemDef): string | null {
  if ((EquipSlots as readonly string[]).includes(def.type)) return def.type;
  if (def.type === "SKIN") {
    const ck = def.metadata.characterKey;
    return typeof ck === "string" ? `SKIN:${ck}` : null;
  }
  return null;
}

export function maxCharacterLevel(p: DemoProfile): number {
  return Math.max(1, ...Object.values(p.characters).map((c) => c.level));
}

export function findCharacter(p: DemoProfile, userCharacterId: string): { key: string; uc: DemoCharacter } {
  for (const [key, uc] of Object.entries(p.characters)) if (uc.id === userCharacterId) return { key, uc };
  throw new DemoError("Character not found");
}

export function unlockCharacter(p: DemoProfile, characterKey: string): void {
  getCharacterDef(characterKey);
  p.characters[characterKey] ??= newCharacter();
}

/** Adds XP computed by the local simulation, applying level-ups and stat points. */
export function addCharacterXp(uc: DemoCharacter, xp: number): void {
  if (!Number.isFinite(xp) || xp <= 0) return;
  uc.xp += Math.round(xp);
  const level = Math.min(MAX_LEVEL, levelFromXp(uc.xp));
  uc.statPoints += statPointsForLevels(uc.level, level);
  uc.level = level;
}

/** Everything the local arena needs to spawn the selected character. */
export function loadForMatch(p: DemoProfile, userCharacterId: string) {
  const { key, uc } = findCharacter(p, userCharacterId);
  const def = getCharacterDef(key);
  const skin = p.inventory.find((r) => r.equipped && r.equippedSlot === `SKIN:${key}`);
  const tint = skin ? itemDef(skin.itemKey).metadata.tint : undefined;
  return {
    username: p.username,
    characterKey: key,
    def,
    level: uc.level,
    xp: uc.xp,
    upgrades: uc.upgrades,
    equipped: equippedCombatItems(p),
    tint: typeof tint === "number" ? tint : def.color,
    potions: countItem(p, "potion_health"),
  };
}

export function recordQuestProgress(p: DemoProfile, objective: DemoObjective, amount: number): string[] {
  const completed: string[] = [];
  if (amount <= 0) return completed;
  for (const q of DEMO_QUESTS) {
    if (q.objective !== objective) continue;
    const s = (p.quests[q.key] ??= { progress: 0, claimed: false });
    const before = s.progress;
    s.progress = Math.min(q.target, s.progress + amount);
    if (before < q.target && s.progress >= q.target) completed.push(q.key);
  }
  return completed;
}

// Idempotent seed: catalog (characters, items, shop, quests), system accounts and the first season.
// Safe to run repeatedly (`pnpm db:seed`). Prices live here/in the DB, never in game logic.

import { getConfig } from "@cryptoarena/config";
import { createPrisma, disconnectAll, withTransaction, type Prisma } from "@cryptoarena/database";
import { ensureSystemAccounts, fundRewardPool } from "@cryptoarena/economy";
import { CHARACTERS, buildItemCatalog } from "@cryptoarena/game-core";
import type { ProductMetadata } from "@cryptoarena/shared";

const config = getConfig();
const prisma = createPrisma(config.DATABASE_URL);
const TOKEN = 10n ** BigInt(config.REWARD_TOKEN_DECIMALS);

type ProductSeed = {
  sku: string;
  name: string;
  description: string;
  category: Prisma.ShopProductCreateInput["category"];
  price: bigint;
  currency: "GOLD" | "GEMS" | "CRYPTO";
  rarity: Prisma.ShopProductCreateInput["rarity"];
  metadata: ProductMetadata;
  perUserLimit?: number;
  sortOrder?: number;
};

const PRODUCTS: ProductSeed[] = [
  { sku: "char_assassin_gems", name: "Assassin", description: "Unlock the Assassin.", category: "CHARACTER", price: 900n, currency: "GEMS", rarity: "RARE", metadata: { grants: [{ kind: "CHARACTER", characterKey: "assassin" }] } },
  { sku: "char_assassin_gold", name: "Assassin (Gold)", description: "Unlock the Assassin with gold earned in the arena.", category: "CHARACTER", price: 25_000n, currency: "GOLD", rarity: "RARE", metadata: { grants: [{ kind: "CHARACTER", characterKey: "assassin" }] }, sortOrder: 1 },
  { sku: "char_mage_gems", name: "Mage", description: "Unlock the Mage.", category: "CHARACTER", price: 1_200n, currency: "GEMS", rarity: "EPIC", metadata: { grants: [{ kind: "CHARACTER", characterKey: "mage" }] } },
  { sku: "char_mage_gold", name: "Mage (Gold)", description: "Unlock the Mage with gold earned in the arena.", category: "CHARACTER", price: 40_000n, currency: "GOLD", rarity: "EPIC", metadata: { grants: [{ kind: "CHARACTER", characterKey: "mage" }] }, sortOrder: 1 },
  { sku: "skin_warrior_crimson", name: "Crimson Warlord", description: "Warrior skin (cosmetic).", category: "SKIN", price: 450n, currency: "GEMS", rarity: "EPIC", metadata: { grants: [{ kind: "ITEM", itemKey: "skin_warrior_crimson", quantity: 1 }] }, perUserLimit: 1 },
  { sku: "skin_assassin_ghost", name: "Ghost Protocol", description: "Assassin skin (cosmetic).", category: "SKIN", price: 900n, currency: "GEMS", rarity: "LEGENDARY", metadata: { grants: [{ kind: "ITEM", itemKey: "skin_assassin_ghost", quantity: 1 }] }, perUserLimit: 1 },
  { sku: "skin_tank_titanium", name: "Titanium Bulwark", description: "Tank skin (cosmetic).", category: "SKIN", price: 300n, currency: "GEMS", rarity: "RARE", metadata: { grants: [{ kind: "ITEM", itemKey: "skin_tank_titanium", quantity: 1 }] }, perUserLimit: 1 },
  { sku: "skin_ranger_emerald", name: "Emerald Hunter", description: "Ranger skin (cosmetic).", category: "SKIN", price: 300n, currency: "GEMS", rarity: "RARE", metadata: { grants: [{ kind: "ITEM", itemKey: "skin_ranger_emerald", quantity: 1 }] }, perUserLimit: 1 },
  { sku: "skin_mage_solar", name: "Solar Archon", description: "Mage skin (cosmetic).", category: "SKIN", price: 1_500n, currency: "GEMS", rarity: "MYTHIC", metadata: { grants: [{ kind: "ITEM", itemKey: "skin_mage_solar", quantity: 1 }] }, perUserLimit: 1 },
  { sku: "weapon_blade_rare", name: "Neon Blade", description: "A reliable rare blade.", category: "WEAPON", price: 3_000n, currency: "GOLD", rarity: "RARE", metadata: { grants: [{ kind: "ITEM", itemKey: "blade_rare", quantity: 1 }] } },
  { sku: "weapon_longbow_rare", name: "Neon Longbow", description: "A reliable rare longbow.", category: "WEAPON", price: 3_000n, currency: "GOLD", rarity: "RARE", metadata: { grants: [{ kind: "ITEM", itemKey: "longbow_rare", quantity: 1 }] } },
  { sku: "equip_striders_uncommon", name: "Tuned Striders", description: "Boots for faster movement.", category: "EQUIPMENT", price: 1_200n, currency: "GOLD", rarity: "UNCOMMON", metadata: { grants: [{ kind: "ITEM", itemKey: "striders_uncommon", quantity: 1 }] } },
  { sku: "equip_vest_epic", name: "Quantum Vest", description: "Epic body armor.", category: "EQUIPMENT", price: 700n, currency: "GEMS", rarity: "EPIC", metadata: { grants: [{ kind: "ITEM", itemKey: "vest_epic", quantity: 1 }] } },
  { sku: "potion_pack_5", name: "Health Potions x5", description: "Five health potions.", category: "CONSUMABLE", price: 150n, currency: "GOLD", rarity: "COMMON", metadata: { grants: [{ kind: "ITEM", itemKey: "potion_health", quantity: 5 }] } },
  { sku: "boost_xp_1", name: "XP Booster", description: "+50% XP for 30 minutes of play.", category: "BOOST", price: 120n, currency: "GEMS", rarity: "RARE", metadata: { grants: [{ kind: "ITEM", itemKey: "boost_xp", quantity: 1 }] } },
  { sku: "premium_vip_30", name: "VIP Pass (30 days)", description: "XP boost, extra quests, VIP cosmetics access and +20 inventory slots. Purely in-game benefits.", category: "PREMIUM_PASS", price: 1_000n, currency: "GEMS", rarity: "EPIC", metadata: { grants: [{ kind: "PREMIUM", tier: "VIP", days: 30 }, { kind: "INVENTORY_SLOTS", amount: 20 }], highlight: true } },
  { sku: "premium_elite_30", name: "Elite Pass (30 days)", description: "Everything in VIP plus Elite quests, a bigger XP boost and +40 inventory slots. Purely in-game benefits.", category: "PREMIUM_PASS", price: 2_500n, currency: "GEMS", rarity: "LEGENDARY", metadata: { grants: [{ kind: "PREMIUM", tier: "ELITE", days: 30 }, { kind: "INVENTORY_SLOTS", amount: 40 }] } },
  { sku: "slots_20", name: "+20 Inventory Slots", description: "Permanently expands your inventory.", category: "COSMETIC", price: 200n, currency: "GEMS", rarity: "UNCOMMON", metadata: { grants: [{ kind: "INVENTORY_SLOTS", amount: 20 }] }, perUserLimit: 5 },
  { sku: "gems_500", name: "500 Gems", description: "Premium currency for characters, skins and passes.", category: "GEMS", price: 5n * TOKEN, currency: "CRYPTO", rarity: "RARE", metadata: { grants: [{ kind: "GEMS", amount: 500 }] } },
  { sku: "gems_1200", name: "1,200 Gems", description: "Premium currency for characters, skins and passes.", category: "GEMS", price: 10n * TOKEN, currency: "CRYPTO", rarity: "EPIC", metadata: { grants: [{ kind: "GEMS", amount: 1_200 }], highlight: true } },
  { sku: "gems_3000", name: "3,000 Gems", description: "Premium currency for characters, skins and passes.", category: "GEMS", price: 22n * TOKEN, currency: "CRYPTO", rarity: "LEGENDARY", metadata: { grants: [{ kind: "GEMS", amount: 3_000 }] } },
];

type QuestSeed = Omit<Prisma.QuestCreateInput, "rewardGold" | "rewardGems" | "rewardCrypto"> & { rewardGold?: bigint; rewardGems?: bigint; rewardCrypto?: bigint };

const QUESTS: QuestSeed[] = [
  { key: "daily_hunter", name: "Daily Hunter", description: "Defeat 20 creatures.", period: "DAILY", objective: "KILL_NPC", target: 20, rewardGold: 300n, rewardXp: 250, rewardCrypto: TOKEN / 2n },
  { key: "daily_gatherer", name: "Scavenger", description: "Collect 25 resources.", period: "DAILY", objective: "COLLECT_RESOURCE", target: 25, rewardGold: 250n, rewardXp: 200 },
  { key: "daily_duelist", name: "Duelist", description: "Defeat 3 players.", period: "DAILY", objective: "KILL_PLAYER", target: 3, rewardGold: 400n, rewardXp: 300, rewardCrypto: TOKEN },
  { key: "daily_regular", name: "Arena Regular", description: "Play 2 matches.", period: "DAILY", objective: "PLAY_MATCH", target: 2, rewardGold: 150n, rewardXp: 100 },
  { key: "daily_vip_chests", name: "VIP: Treasure Run", description: "Open 3 supply chests.", period: "DAILY", objective: "OPEN_CHEST", target: 3, rewardGold: 600n, rewardGems: 10n, rewardXp: 300, requiredTier: "VIP" },
  { key: "weekly_slayer", name: "Slayer", description: "Defeat 250 creatures.", period: "WEEKLY", objective: "KILL_NPC", target: 250, rewardGold: 2_500n, rewardGems: 25n, rewardXp: 2_000, rewardCrypto: 3n * TOKEN },
  { key: "weekly_champion", name: "Champion", description: "Win a ranked match.", period: "WEEKLY", objective: "WIN_MATCH", target: 1, rewardGold: 1_500n, rewardGems: 30n, rewardXp: 1_500, rewardCrypto: 2n * TOKEN },
  { key: "weekly_elite_damage", name: "Elite: Devastator", description: "Deal 100,000 damage.", period: "WEEKLY", objective: "DEAL_DAMAGE", target: 100_000, rewardGold: 3_000n, rewardGems: 60n, rewardXp: 3_000, requiredTier: "ELITE" },
  { key: "season_veteran", name: "Season Veteran", description: "Reach level 20 with any character.", period: "SEASONAL", objective: "REACH_LEVEL", target: 20, rewardGold: 5_000n, rewardGems: 100n, rewardXp: 0, rewardCrypto: 5n * TOKEN },
  { key: "ach_first_blood", name: "First Blood", description: "Defeat your first player.", period: "ACHIEVEMENT", objective: "KILL_PLAYER", target: 1, rewardGold: 200n, rewardXp: 100 },
  { key: "ach_relic_hunter", name: "Relic Hunter", description: "Collect 10 resources or relics.", period: "ACHIEVEMENT", objective: "COLLECT_RESOURCE", target: 10, rewardGold: 250n, rewardXp: 150 },
];

async function main(): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await ensureSystemAccounts(tx);

    for (const c of CHARACTERS) {
      const character = await tx.character.upsert({
        where: { key: c.key },
        update: { name: c.name, class: c.class, rarity: c.rarity, description: c.description, skill: c.skill as object, ultimate: c.ultimate as object, isStarter: c.isStarter },
        create: { key: c.key, name: c.name, class: c.class, rarity: c.rarity, description: c.description, skill: c.skill as object, ultimate: c.ultimate as object, isStarter: c.isStarter },
      });
      const stats = {
        baseHp: c.base.hp,
        baseDamage: c.base.damage,
        baseArmor: c.base.armor,
        baseSpeed: c.base.speed,
        baseAttackSpeed: c.base.attackSpeed,
        baseCritChance: c.base.critChance,
        baseRange: c.base.range,
        hpPerLevel: c.base.hpPerLevel,
        damagePerLevel: c.base.damagePerLevel,
        armorPerLevel: c.base.armorPerLevel,
      };
      await tx.characterStats.upsert({ where: { characterId: character.id }, update: stats, create: { characterId: character.id, ...stats } });
    }

    for (const i of buildItemCatalog()) {
      const data = {
        name: i.name,
        description: i.description,
        type: i.type,
        rarity: i.rarity,
        stats: i.stats as object,
        stackable: i.stackable,
        maxStack: i.maxStack,
        maxUpgrade: i.maxUpgrade,
        levelRequirement: i.levelRequirement,
        dropWeight: i.dropWeight,
        metadata: i.metadata as object,
      };
      await tx.item.upsert({ where: { key: i.key }, update: data, create: { key: i.key, ...data } });
    }

    for (const p of PRODUCTS) {
      const data = {
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        currency: p.currency,
        rarity: p.rarity,
        metadata: p.metadata as unknown as object,
        perUserLimit: p.perUserLimit ?? null,
        sortOrder: p.sortOrder ?? 0,
      };
      await tx.shopProduct.upsert({ where: { sku: p.sku }, update: data, create: { sku: p.sku, ...data } });
    }

    for (const q of QUESTS) {
      const data = { ...q, rewardGold: q.rewardGold ?? 0n, rewardGems: q.rewardGems ?? 0n, rewardCrypto: q.rewardCrypto ?? 0n };
      await tx.quest.upsert({ where: { key: q.key }, update: data, create: data });
    }

    for (const key of ["deposits_enabled", "withdrawals_enabled", "crypto_rewards_enabled", "purchases_enabled", "play_enabled"]) {
      await tx.featureFlag.upsert({ where: { key }, update: {}, create: { key, enabled: true } });
    }

    const now = new Date();
    const active = await tx.season.findFirst({ where: { status: "ACTIVE" } });
    if (!active) {
      const season = await tx.season.upsert({
        where: { key: "S1" },
        update: { status: "ACTIVE", startsAt: now, endsAt: new Date(now.getTime() + 60 * 86_400_000) },
        create: {
          key: "S1",
          name: "Season 1 — Genesis",
          status: "ACTIVE",
          startsAt: now,
          endsAt: new Date(now.getTime() + 60 * 86_400_000),
          rewardPool: config.SEASON_REWARD_POOL,
          dailyRewardBudget: config.REWARD_POOL,
        },
      });
      // The pool mirrors tokens the operator sets aside in the treasury for this season.
      await fundRewardPool(tx, season.rewardPool, `season:${season.key}`, null, `Season ${season.key} reward pool`);
    }
  }, { timeoutMs: 60_000 });

  const counts = {
    characters: await prisma.character.count(),
    items: await prisma.item.count(),
    products: await prisma.shopProduct.count(),
    quests: await prisma.quest.count(),
  };
  console.log("Seed complete", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectAll());

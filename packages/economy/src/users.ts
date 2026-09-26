import { randomInt } from "node:crypto";
import type { Tx, User } from "@cryptoarena/database";
import { grantCharacter } from "./characters";
import { grantItem } from "./inventory";
import { postJournal, transfer } from "./ledger";

const ADJECTIVES = ["Neon", "Quantum", "Cyber", "Void", "Pixel", "Turbo", "Hyper", "Glitch", "Nova", "Shadow"];
const NOUNS = ["Wolf", "Blade", "Ronin", "Falcon", "Golem", "Spark", "Viper", "Titan", "Ghost", "Raven"];

export function randomUsername(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}${NOUNS[randomInt(NOUNS.length)]}${randomInt(1000, 9999)}`;
}

export const WELCOME_GOLD = 500n;

/** Idempotent onboarding: starter characters, a few potions and some gold. No crypto is ever granted. */
export async function onboardUser(tx: Tx, user: User): Promise<void> {
  const starters = await tx.character.findMany({ where: { isStarter: true, active: true } });
  for (const c of starters) await grantCharacter(tx, user.id, c.key);
  await grantItem(tx, { userId: user.id, itemKey: "potion_health", quantity: 3, source: "STARTER", sourceRef: `welcome:${user.id}:potions`, ignoreCapacity: true });
  await postJournal(tx, {
    type: "GAME_REWARD",
    idempotencyKey: `welcome:${user.id}:gold`,
    description: "Welcome bonus",
    legs: transfer({ system: "GOLD_ISSUANCE" }, { userId: user.id, kind: "GOLD" }, WELCOME_GOLD),
  });
}

export async function createUser(tx: Tx, opts: { isGuest: boolean; countryCode?: string | null }): Promise<User> {
  for (let i = 0; i < 5; i++) {
    const username = randomUsername();
    const clash = await tx.user.findUnique({ where: { username } });
    if (clash) continue;
    const user = await tx.user.create({ data: { username, isGuest: opts.isGuest, countryCode: opts.countryCode ?? null } });
    await onboardUser(tx, user);
    return user;
  }
  throw new Error("Could not allocate a username");
}

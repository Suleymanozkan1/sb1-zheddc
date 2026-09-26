// Grants (or revokes) an admin role.  Usage:
//   pnpm admin:grant <username|walletAddress|userId> <SUPER_ADMIN|ADMIN|MODERATOR|SUPPORT|NONE>
import { getConfig } from "@cryptoarena/config";
import { createPrisma, disconnectAll } from "@cryptoarena/database";
import { writeAudit } from "@cryptoarena/economy";

const ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT", "NONE"] as const;

async function main(): Promise<void> {
  const [who, roleArg = "SUPER_ADMIN"] = process.argv.slice(2);
  const role = roleArg.toUpperCase() as (typeof ROLES)[number];
  if (!who || !ROLES.includes(role)) {
    console.error("Usage: pnpm admin:grant <username|wallet|userId> <SUPER_ADMIN|ADMIN|MODERATOR|SUPPORT|NONE>");
    process.exit(1);
  }
  const prisma = createPrisma(getConfig().DATABASE_URL);
  const isUuid = /^[0-9a-f-]{36}$/i.test(who);
  const user =
    (await prisma.user.findFirst({ where: { OR: [{ username: who }, ...(isUuid ? [{ id: who }] : [])] } })) ??
    (await prisma.wallet.findUnique({ where: { address: who }, include: { user: true } }))?.user ??
    null;
  if (!user) {
    console.error(`No user found for "${who}". Sign in once (game client) first.`);
    process.exit(1);
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.adminUser.findUnique({ where: { userId: user.id } });
    const after =
      role === "NONE"
        ? before
          ? await tx.adminUser.update({ where: { userId: user.id }, data: { active: false } })
          : null
        : await tx.adminUser.upsert({ where: { userId: user.id }, update: { role, active: true }, create: { userId: user.id, role } });
    await writeAudit(tx, {
      actorType: "SYSTEM",
      userId: user.id,
      action: "ADMIN_ROLE_SET_CLI",
      targetType: "AdminUser",
      targetId: user.id,
      before: before ? { role: before.role, active: before.active } : null,
      after: after ? { role: after.role, active: after.active } : null,
      reason: "granted via scripts/grant-admin.ts",
    });
  });
  console.log(`${user.username} → ${role}`);
  await disconnectAll();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

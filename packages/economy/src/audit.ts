import type { Prisma, Tx } from "@cryptoarena/database";

export interface AuditInput {
  actorType: "ADMIN" | "SYSTEM" | "USER";
  adminUserId?: string | null;
  userId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val: unknown) => (typeof val === "bigint" ? val.toString() : val))) as Prisma.InputJsonValue;
}

export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: input.actorType,
      adminUserId: input.adminUserId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  });
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";
export type { Prisma } from "./generated/prisma/client";

export type Db = InstanceType<typeof PrismaClient>;
/** Interactive transaction client. */
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const clients = new Map<string, Db>();

export function createPrisma(databaseUrl: string): Db {
  const existing = clients.get(databaseUrl);
  if (existing) return existing;
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  clients.set(databaseUrl, prisma);
  return prisma;
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.$disconnect()));
  clients.clear();
}

/** Measures a trivial round-trip; used by readiness probes and metrics. */
export async function pingDatabase(prisma: Db): Promise<number> {
  const start = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return performance.now() - start;
}

/** Postgres serialization / deadlock errors are safe to retry. */
export function isRetryableTxError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; meta?: { code?: string } } | null;
  if (!e) return false;
  const code = e.code ?? e.meta?.code;
  if (code === "P2034" || code === "40001" || code === "40P01") return true;
  return typeof e.message === "string" && /could not serialize|deadlock detected|write conflict/i.test(e.message);
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === "P2002" || (typeof e.message === "string" && /Unique constraint failed|duplicate key/i.test(e.message)));
}

/** Runs `fn` in an interactive transaction, retrying on serialization failures/deadlocks. */
export async function withTransaction<T>(
  prisma: Db,
  fn: (tx: Tx) => Promise<T>,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx as Tx), { timeout: opts.timeoutMs ?? 15_000, maxWait: 10_000 });
    } catch (err) {
      if (attempt >= retries || !isRetryableTxError(err)) throw err;
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 20));
    }
  }
}

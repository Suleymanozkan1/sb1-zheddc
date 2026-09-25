import { pingDatabase } from "@cryptoarena/database";
import { metrics, registry } from "@cryptoarena/observability";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../context";

export async function registerHealthRoutes(app: FastifyInstance, ctx: ApiContext): Promise<void> {
  const noLimit = { config: { rateLimit: false as const } };

  app.get("/health", noLimit, async () => ({ status: "ok", service: "api", time: new Date().toISOString() }));

  app.get("/ready", noLimit, async (_req, reply) => {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
    try {
      const ms = await pingDatabase(ctx.prisma);
      metrics.dbLatency.observe(ms);
      checks.database = { ok: true, ms: Math.round(ms * 10) / 10 };
    } catch (err) {
      checks.database = { ok: false, error: (err as Error).message };
    }
    if (ctx.redis) {
      try {
        const start = performance.now();
        await ctx.redis.ping();
        checks.redis = { ok: true, ms: Math.round((performance.now() - start) * 10) / 10 };
      } catch (err) {
        checks.redis = { ok: false, error: (err as Error).message };
      }
    }
    const ok = Object.values(checks).every((c) => c.ok);
    reply.status(ok ? 200 : 503);
    return { status: ok ? "ready" : "degraded", checks };
  });

  app.get("/metrics", noLimit, async (_req, reply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });
}

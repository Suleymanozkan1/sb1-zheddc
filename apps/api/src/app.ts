import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppError } from "@cryptoarena/economy";
import { metrics } from "@cryptoarena/observability";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { authenticate, checkCsrf } from "./auth";
import type { ApiContext } from "./context";
import { sendError, serialize } from "./http";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerGameRoutes } from "./routes/game";
import { registerHealthRoutes } from "./routes/health";
import { registerUserRoutes } from "./routes/user";

export async function buildApp(ctx: ApiContext): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: ctx.logger as unknown as FastifyBaseLogger,
    // Trust exactly N reverse-proxy hops (never blindly trust X-Forwarded-For).
    trustProxy: (_addr: string, hop: number) => hop < ctx.config.TRUST_PROXY_HOPS,
    bodyLimit: 64 * 1024,
    disableRequestLogging: ctx.config.NODE_ENV === "test",
  });

  app.setReplySerializer((payload) => serialize(payload));
  app.decorateRequest("auth", null);

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cookie, { hook: "onRequest" });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    ...(ctx.redis ? { redis: ctx.redis, nameSpace: "ca-rl:" } : {}),
    keyGenerator: (req) => req.auth?.id ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: { code: "RATE_LIMITED", message: `Too many requests, retry in ${Math.ceil(context.ttl / 1000)}s` },
    }),
  });

  // Only same-site browser origins may call the API with credentials.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && !ctx.config.webOrigins.includes(origin)) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendError(reply, new AppError("FORBIDDEN", "Origin not allowed"));
      }
    } else if (origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("vary", "origin");
      if (req.method === "OPTIONS") {
        reply.header("access-control-allow-headers", "content-type,x-csrf-token");
        reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
        return reply.status(204).send();
      }
    }
    req.auth = await authenticate(ctx, req);
    checkCsrf(req);
  });

  app.addHook("onResponse", async (req, reply) => {
    metrics.httpRequests.inc({ method: req.method, route: req.routeOptions.url ?? "unknown", status: String(reply.statusCode) });
    if (reply.statusCode >= 500) metrics.httpErrors.inc();
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return sendError(reply, err);
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 429) return reply.status(429).send(err);
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: "BAD_REQUEST", message: e.message } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }));

  await registerHealthRoutes(app, ctx);
  await registerAuthRoutes(app, ctx);
  await registerUserRoutes(app, ctx);
  await registerGameRoutes(app, ctx);
  await registerAdminRoutes(app, ctx);
  return app;
}

import { AppError } from "@cryptoarena/economy";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

/** JSON serializer that renders bigint as decimal strings. */
export function serialize(payload: unknown): string {
  return JSON.stringify(payload, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

export function parseBody<T extends z.ZodType>(schema: T, req: FastifyRequest): z.infer<T> {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) throw new AppError("BAD_REQUEST", "Invalid request body", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

export function parseQuery<T extends z.ZodType>(schema: T, req: FastifyRequest): z.infer<T> {
  const r = schema.safeParse(req.query ?? {});
  if (!r.success) throw new AppError("BAD_REQUEST", "Invalid query", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

export function parseParams<T extends z.ZodType>(schema: T, req: FastifyRequest): z.infer<T> {
  const r = schema.safeParse(req.params ?? {});
  if (!r.success) throw new AppError("BAD_REQUEST", "Invalid path parameters");
  return r.data;
}

export function sendError(reply: FastifyReply, err: AppError): FastifyReply {
  return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
}

export function clientCountry(req: FastifyRequest, header: string): string | null {
  if (!header) return null;
  const v = req.headers[header.toLowerCase()];
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null;
}

// Creates a brand-new, uniquely named database for this test run, applies migrations with the
// non-destructive `prisma migrate deploy`, seeds it, and drops ONLY that ephemeral database at
// the end. Existing databases (dev or test) are never reset or modified.
import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadEnv({ quiet: true });
  const base = process.env.DATABASE_URL_TEST;
  if (!base) throw new Error("DATABASE_URL_TEST must be set for integration tests");
  const baseUrl = new URL(base);
  const dbName = `${baseUrl.pathname.slice(1) || "cryptoarena_test"}_run_${process.pid}_${Date.now()}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const runUrl = new URL(base);
  runUrl.pathname = `/${dbName}`;
  const url = runUrl.toString();
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test", SOLANA_MOCK: "true", LOG_LEVEL: "fatal" };
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env });
  execSync("pnpm exec tsx prisma/seed.ts", { stdio: "inherit", env });
  project.provide("testDatabaseUrl", url);

  return async () => {
    if (process.env.KEEP_TEST_DB === "true") return;
    const c = new pg.Client({ connectionString: base });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await c.end();
  };
}

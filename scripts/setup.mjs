#!/usr/bin/env node
// One-command local setup:  pnpm setup
//  1. creates .env from .env.example (with a random JWT secret) if missing
//  2. starts PostgreSQL + Redis with docker compose (if Docker is available)
//  3. applies migrations and seeds the catalog / first season
import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  let env = readFileSync(".env", "utf8");
  env = env.replace(/^JWT_SECRET=$/m, `JWT_SECRET=${randomBytes(48).toString("base64url")}`);
  // Until a devnet treasury/mint is configured, run the chain layer in simulated mode.
  env = env.replace(/^SOLANA_MOCK=false$/m, "SOLANA_MOCK=true");
  writeFileSync(".env", env);
  console.log("Created .env (SOLANA_MOCK=true until you run `pnpm devnet:setup`).");
}

const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
if (hasDocker) {
  run("docker compose up -d postgres redis");
  run("node scripts/wait-for-db.mjs");
} else {
  console.log("\nDocker not available — make sure PostgreSQL (and optionally Redis) from .env are running.");
}

run("pnpm exec prisma migrate deploy");
run("pnpm exec prisma db seed");
console.log("\n✅ Setup complete. Start everything with:  pnpm dev");

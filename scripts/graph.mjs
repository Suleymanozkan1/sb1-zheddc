#!/usr/bin/env node
// Builds a local code knowledge graph of CryptoArena with Graphify (tree-sitter, no LLM, nothing
// leaves the machine). Output: graphify-out/{graph.json,graph.html,GRAPH_REPORT.md}
// Install once:  uv tool install graphifyy   (or: pipx install graphifyy)
// Query:         graphify explain "postJournal" --graph graphify-out/graph.json
//                graphify path "ArenaRoom" "grantReward" --graph graphify-out/graph.json --undirected
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (spawnSync("graphify", ["--help"], { stdio: "ignore" }).status !== 0) {
  console.error("graphify CLI not found. Install it with: uv tool install graphifyy  (source: repos/graphify-labs-graphify)");
  process.exit(1);
}

// Graph only our code (skip node_modules, generated Prisma client, builds and reference repos).
const stage = join(tmpdir(), "cryptoarena-graph", "cryptoarena");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const skip = (src) => !/node_modules|[\\/]dist[\\/]?|[\\/]generated[\\/]?|graphify-out/.test(src);
for (const dir of ["apps", "packages", "prisma", "scripts", "tests"]) {
  if (existsSync(dir)) cpSync(dir, join(stage, dir), { recursive: true, filter: skip });
}
execSync("graphify update .", { cwd: stage, stdio: "inherit" });
rmSync("graphify-out", { recursive: true, force: true });
cpSync(join(stage, "graphify-out"), "graphify-out", { recursive: true });
console.log("\nGraph written to graphify-out/ (open graphify-out/graph.html)");

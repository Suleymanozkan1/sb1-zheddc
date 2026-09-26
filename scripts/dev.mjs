#!/usr/bin/env node
// Starts API, game server, blockchain service, web client and admin panel with prefixed logs.
import { spawn } from "node:child_process";

const services = [
  ["api", "@cryptoarena/api", "\x1b[36m"],
  ["game", "@cryptoarena/game-server", "\x1b[35m"],
  ["chain", "@cryptoarena/blockchain-service", "\x1b[33m"],
  ["web", "@cryptoarena/web", "\x1b[32m"],
  ["admin", "@cryptoarena/admin", "\x1b[34m"],
];
const only = process.argv.slice(2);
const children = [];

for (const [name, pkg, color] of services) {
  if (only.length && !only.includes(name)) continue;
  const child = spawn("pnpm", ["--filter", pkg, "dev"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "1" } });
  const prefix = `${color}[${name.padEnd(5)}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) out.write(prefix + l + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => console.log(`${prefix}exited with code ${code}`));
  children.push(child);
}

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("\nWeb:   http://localhost:5173\nAdmin: http://localhost:5174\nAPI:   http://localhost:3000/health\nGame:  ws://localhost:2567\n");

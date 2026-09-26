import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Falls back to the local docker-compose database so `prisma generate` works without a .env.
    url: process.env.DATABASE_URL ?? "postgresql://cryptoarena:cryptoarena@localhost:5432/cryptoarena",
  },
});

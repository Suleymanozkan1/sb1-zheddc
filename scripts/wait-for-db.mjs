// Waits until PostgreSQL from DATABASE_URL accepts connections (used by setup and Docker).
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
for (let i = 0; i < 60; i++) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    console.log("database is ready");
    process.exit(0);
  } catch {
    await client.end().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.error("database did not become ready in time");
process.exit(1);

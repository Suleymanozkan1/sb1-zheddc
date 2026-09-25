import { config as loadEnv } from "dotenv";
import { inject } from "vitest";

loadEnv({ quiet: true });
process.env.DATABASE_URL = inject("testDatabaseUrl");
process.env.NODE_ENV = "test";
process.env.SOLANA_MOCK = "true";
process.env.SOLANA_NETWORK = "devnet";
process.env.REWARD_TOKEN_MINT = "MockMint11111111111111111111111111111111111";
process.env.TREASURY_PUBLIC_KEY = "MockTreasury11111111111111111111111111111111";
process.env.WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS = "0";
process.env.LOG_LEVEL = "fatal";
process.env.REDIS_URL = "";
process.env.DEV_BOTS = "0";

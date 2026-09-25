# Agent instructions (CryptoArena)

Read by coding agents (Claude Code, CodeRabbit autofix skill, etc.).

## Commands
- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint` (zero warnings allowed)
- Unit tests: `pnpm test` · Integration (needs PostgreSQL + `DATABASE_URL_TEST`): `pnpm test:integration` · E2E: `pnpm test:e2e`
- Build: `pnpm build`
- Code graph: `pnpm graph` then `graphify explain "<symbol>" --graph graphify-out/graph.json`

## Rules
- Game outcomes, balances and rewards are computed server-side only. Never accept positions, damage, XP, gold, rewards or inventory changes from clients.
- Every financial change goes through `postJournal` (packages/economy/src/ledger.ts) with an idempotency key. Never UPDATE/DELETE ledger rows; post a compensating journal.
- The treasury signer lives only in `apps/blockchain-service`. Never import `createEnvTreasurySigner` elsewhere or send private keys to the browser, logs or the database.
- Validate every API input with a schema from `packages/validation`.
- Prices, pools and limits come from the database/config — never hard-code them.
- Strict TypeScript, no `any`, erasable syntax (no `enum`, no constructor parameter properties).
- Do not run destructive database commands (`prisma migrate reset`, `DROP`) against shared databases; integration tests create their own ephemeral database.
- Reference repositories in `repos/` are read-only.

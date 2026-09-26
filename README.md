# CryptoArena

Browser-based, real-time **.io arena game** (Phaser 4 + Colyseus) with a server-authoritative
simulation, a PostgreSQL double-entry ledger, and optional **Solana (devnet)** deposits,
performance-based rewards and withdrawals.

> **Not an investment product.** Money paid in the game buys in-game items, cosmetics and utility.
> Crypto rewards come only from gameplay (kills, quests, leaderboards, ranked matches, events),
> are paid from **finite, capped reward pools**, and are never guaranteed. There is no APY,
> interest, ROI promise or referral scheme.

---

## Hızlı başlangıç (TR)

```bash
pnpm install          # bağımlılıklar + Prisma client
pnpm setup            # .env oluşturur, Postgres/Redis'i (Docker) başlatır, migration + seed
pnpm dev              # API :3000, oyun sunucusu :2567, web :5173, admin :5174, blockchain-service
```

Tarayıcıda **http://localhost:5173** → **PLAY NOW** → *Play as Guest* (veya cüzdan bağla) → karakter seç → **PLAY**.
Varsayılan kurulum `SOLANA_MOCK=true` ile çalışır (gerçek token hareket etmez). Gerçek devnet için
[Solana devnet kurulumu](#12-solana-devnet-setup) bölümüne bakın.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Requirements](#3-requirements)
4. [Installation](#4-installation)
5. [Environment variables](#5-environment-variables)
6. [Database setup](#6-database-setup)
7. [Running locally](#7-running-locally)
8. [Running the Phaser client](#8-running-the-phaser-client)
9. [Running the Colyseus server](#9-running-the-colyseus-server)
10. [Running the API](#10-running-the-api)
11. [Running the admin panel](#11-running-the-admin-panel)
12. [Solana devnet setup](#12-solana-devnet-setup)
13. [Wallet connection](#13-wallet-connection)
14. [Deposit flow](#14-deposit-flow)
15. [Withdrawal flow](#15-withdrawal-flow)
16. [Reward system](#16-reward-system)
17. [Anti-cheat](#17-anti-cheat)
18. [Testing](#18-testing)
19. [Docker](#19-docker)
20. [Production deployment](#20-production-deployment)
21. [Security](#21-security)
22. [Future smart-contract architecture](#22-future-smart-contract-architecture)
23. [Developer tooling (Graphify, CodeRabbit skills)](#23-developer-tooling)
24. [Third-party code & licenses](#24-third-party-code--licenses)

---

## 1. Project overview

| Feature | Implementation |
|---|---|
| 2D top-down arena, 10 000 × 10 000 world | Deterministic map from a seed (`packages/game-core/src/map.ts`): 4 regions (Neon Plains → Crystal Core), ~660 obstacles, safe merchant camps, XP-bonus and healing zones |
| Controls | WASD move · mouse aim · click attack · Space/Shift/RMB dash · Q skill · R ultimate · E loot/harvest · F potion · B buy at merchant · twin-stick touch controls on mobile |
| 5 characters | Warrior, Assassin, Tank, Ranger, Mage — base HP, damage, armor, speed, attack speed, crit, range, skill, ultimate, rarity. Levels 1–50, stat points + gold stat upgrades |
| Combat | Server-side melee cones, projectiles, AoE, blink, buffs, meteor; armor mitigation, crits, lifesteal, dash, cooldowns, spawn protection, respawn |
| World | NPCs with FSM AI (idle/wander/chase/flee/return), supply chests, a world boss, resources and quest relics, loot drops with owner lock |
| Items | 6 rarities (COMMON → MYTHIC), weapon/armor/helmet/boots/ring/amulet/skin/consumable, +1…+20 upgrades paid in gold |
| Economy | **GOLD** (off-chain), **GEMS** (premium), **CRYPTO** (on-chain SPL token; internal spendable vs withdrawable balances) |
| Modes | Casual (persistent open arena) and Ranked (timed matches, standings, tournament rewards) |
| Meta | Shop, inventory, quests (daily/weekly/season/achievements, premium-gated), leaderboards (global/daily/weekly/season), premium pass (FREE/VIP/ELITE) |
| Admin | Users, wallets, deposits, withdrawals (review/approve/cancel), rewards, items, characters, shop pricing, purchases (refund), seasons, leaderboards, rooms, ledger, audit log, anti-cheat |
| Dev bots | `DEV_BOTS=n` spawns server-side bots (wander → collect → attack → flee) that use the same validated input path as players |

## 2. Architecture

```
apps/
  web/                  React + Vite + Tailwind dashboard, Phaser 4 game scene, wallet-adapter
  admin/                React admin panel (role-gated)
  api/                  Fastify REST API: auth, wallet, shop, inventory, quests, leaderboard, admin, jobs
  game-server/          Colyseus 0.18 authoritative rooms (arena_casual / arena_ranked)
  blockchain-service/   Withdrawal worker — the ONLY process that holds the treasury signer
packages/
  shared/               Enums, DTOs and the typed client↔server realtime protocol
  game-core/            Deterministic simulation primitives shared by server & client prediction
  economy/              Ledger, rewards, shop, inventory, quests, leaderboard, deposits, withdrawals, admin ops
  database/             Prisma 7 client (pg driver adapter) + transaction helpers
  blockchain/           @solana/kit gateway, deposit verification, tx builders, treasury signer abstraction, mock chain
  config/               Zod-validated environment configuration
  validation/           Zod schemas for every REST input
  observability/        pino structured logging (with secret redaction) + prom-client metrics
  ui/                   Shared React components + design tokens
prisma/                 schema.prisma, migrations (incl. immutability triggers), seed.ts
docker/                 Dockerfiles, nginx, DB init
scripts/                setup, dev runner, devnet bootstrap, admin grant, graph, smoke test
tests/                  integration (real Postgres) and e2e (Playwright)
repos/                  Reference repositories (git submodules, read-only)
```

```
 Browser (React + Phaser)                                    Solana devnet
  │  REST (/api, same-origin cookies + CSRF)                      ▲       ▲
  │  WebSocket (inputs only)                                      │ read  │ sign & send
  ▼                                    ┌────────────┐             │       │
 ┌───────────┐  ticket (60 s JWT)     │ API        │─────────────┘       │
 │ web/admin │──────────────────────▶ │ Fastify    │  deposits verify    │
 └───────────┘                        └─────┬──────┘                     │
        │ ws                                │ economy (ledger)           │
        ▼                                   ▼                            │
 ┌──────────────┐  results, loot,     ┌────────────┐   claim PENDING ┌──┴───────────────┐
 │ game-server  │  rewards (idempot.) │ PostgreSQL │◀────────────────│ blockchain-svc   │
 │ Colyseus     │────────────────────▶│ + ledger   │   settle/refund │ treasury signer  │
 └──────────────┘                     └────────────┘                 └──────────────────┘
```

* **Server authority** — the client sends only intent (`player_move` = movement vector, aim, button bitmask).
  Position, damage, HP, XP, gold, loot, inventory and rewards are computed on the server.
* **Tick model** — 60 Hz fixed-step simulation, 20 Hz state patches, client-side prediction of the local
  player with the *same* `stepMovement` function and reconciliation on the server's acknowledged input
  sequence; remote entities are interpolated 100 ms in the past.
* **Interest management** — entity maps use Colyseus schema `.view()` and a per-client `StateView`, so a
  client only receives entities near its player (10k × 10k world stays cheap).
* **Money** — every balance change is a balanced journal in an append-only ledger (see §16/§21).

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ECONOMY.md`](docs/ECONOMY.md), [`docs/SECURITY.md`](docs/SECURITY.md).

## 3. Requirements

* Node.js **≥ 22.12** (22.22 recommended) and **pnpm 10** (`corepack enable`)
* PostgreSQL **16** (Docker or local) and optionally Redis 7 (rate limiting store)
* Docker + Docker Compose (optional, for the one-command setup and containers)
* A Solana wallet browser extension for wallet features: **Phantom**, **Solflare** or **Backpack**
* Optional: [Solana CLI](https://docs.solanalabs.com/cli/install) for inspecting devnet accounts

## 4. Installation

```bash
git clone --recurse-submodules <repo-url> cryptoarena && cd cryptoarena
corepack enable
pnpm install            # also runs `prisma generate`
pnpm setup              # creates .env, starts postgres+redis via docker compose, migrates, seeds
```

`repos/` contains the reference projects as submodules; they are not needed to build or run the game.

## 5. Environment variables

All values live in `.env` (copy of [`.env.example`](.env.example)); every variable is validated at startup by
`packages/config`. Production uses a separate file ([`.env.production.example`](.env.production.example)) and a secret manager.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables strict checks (no mock chain, no dev bots, strong JWT secret) |
| `DATABASE_URL` / `DATABASE_URL_TEST` | local | PostgreSQL connection strings (tests create an ephemeral DB from the test URL) |
| `REDIS_URL` | `redis://localhost:6379` | Optional rate-limit store (falls back to memory) |
| `JWT_SECRET` | — | ≥ 32 chars, signs access tokens and game tickets |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` / `GAME_TICKET_TTL_SECONDS` | 900 / 30 / 60 | Session lifetimes |
| `PUBLIC_WEB_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Allowed browser origins |
| `ALLOW_GUESTS` | `true` | Guest accounts (no crypto features) |
| `GAME_TICK_RATE` / `GAME_PATCH_RATE_MS` | 60 / 50 | Simulation and network rates |
| `MAX_PLAYERS_PER_ROOM`, `RANKED_MAX_PLAYERS`, `RANKED_MIN_PLAYERS`, `RANKED_MATCH_SECONDS` | 50, 12, 2, 600 | Matchmaking |
| `ARENA_SIZE`, `NPC_DENSITY`, `ARENA_MAP_SEED`, `DEV_BOTS` | 10000, 1, 1337, 6 | World & bots |
| `SOLANA_NETWORK` | `devnet` | `mainnet-beta` requires `NODE_ENV=production` **and** `ALLOW_MAINNET=true` |
| `SOLANA_RPC_URL`, `SOLANA_COMMITMENT` | devnet, `finalized` | RPC endpoint and required finality for deposits/withdrawals |
| `SOLANA_MOCK` | `false` (`setup` sets `true` until devnet is configured) | Simulated chain for local dev/tests; refused in production |
| `TREASURY_PUBLIC_KEY` | — | Treasury wallet (receives deposits, pays withdrawals) |
| `TREASURY_SECRET` | — | **Only read by `blockchain-service`.** Base58 or JSON byte array |
| `REWARD_TOKEN_MINT`, `REWARD_TOKEN_DECIMALS`, `REWARD_TOKEN_SYMBOL` | —, 6, `ARENA` | SPL token used for deposits/rewards |
| `MIN_DEPOSIT`, `MAX_DEPOSIT` | 1, 1 000 000 tokens | Deposit limits (base units) |
| `MIN_WITHDRAWAL`, `MAX_WITHDRAWAL`, `DAILY_WITHDRAWAL_LIMIT`, `WITHDRAWAL_FEE` | 5, 500, 1000, 0.1 tokens | Withdrawal limits (base units) |
| `WITHDRAWAL_COOLDOWN_SECONDS`, `WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS` | 3600, 24 | Velocity controls |
| `WITHDRAWAL_REVIEW_THRESHOLD`, `WITHDRAWAL_RISK_SCORE_REVIEW`, `WITHDRAWAL_MAX_ATTEMPTS` | 200 tokens, 50, 8 | Manual review & retry policy |
| `REWARD_POOL` | 16 000 tokens | Global **daily** crypto reward budget (≈ season pool / 60 days) |
| `SEASON_REWARD_POOL` | 1 000 000 tokens | Pool funded when a season starts |
| `USER_DAILY_REWARD_CAP`, `KILL_REWARD_BASE`, `PVP_SAME_VICTIM_COOLDOWN_SECONDS` | 100, 0.2 tokens, 600 | Anti-farming |
| `PVP_REWARD_MIN_VICTIM_LEVEL`, `PVP_REPEAT_DECAY_BPS` | 5, 5000 | PvP crypto only for non-guest victims ≥ level 5; repeat kills of the same victim halve per day |
| `RANKED_REWARD_BASE`, `RANKED_REWARD_MIN_HUMANS`, `RANKED_REWARD_FULL_HUMANS` | 2 tokens, 6, 12 | Ranked top-3 crypto needs ≥ 6 real players (50 % → 100 % at 12) |
| `TITAN_REWARD_BASE`, `TITAN_MIN_DAMAGE_SHARE_BPS`, `TITAN_REWARDS_PER_USER_DAY` | 5 tokens, 500, 3 | World boss reward split by damage share (≥ 5 %), max 3 per user per day |
| `BLOCKED_COUNTRIES`, `MIN_AGE`, `REQUIRE_KYC_FOR_WITHDRAWAL`, `GEO_COUNTRY_HEADER` | — | Compliance hooks |
| `VITE_API_URL`, `VITE_GAME_URL`, `VITE_SOLANA_NETWORK`, `VITE_SOLANA_RPC_URL` | | Browser build-time values (never secrets) |

## 6. Database setup

**Docker (recommended):** `docker compose up -d postgres redis` (done by `pnpm setup`). The init script also
creates `cryptoarena_test` and grants `CREATEDB` for integration tests.

**Local PostgreSQL:**

```sql
CREATE USER cryptoarena WITH PASSWORD 'cryptoarena' CREATEDB;
CREATE DATABASE cryptoarena OWNER cryptoarena;
CREATE DATABASE cryptoarena_test OWNER cryptoarena;
```

Then:

```bash
pnpm db:deploy    # prisma migrate deploy (applies prisma/migrations)
pnpm db:seed      # characters, items, shop products, quests, first season + reward pool (idempotent)
pnpm db:migrate   # during development, after editing prisma/schema.prisma
```

The initial migration adds database-level guarantees Prisma cannot express: append-only triggers on
`BalanceLedger`, `LedgerJournal` and `AuditLog`, non-negative user balances, one equipped item per slot,
a single active season.

## 7. Running locally

```bash
pnpm dev                  # everything, with prefixed logs
pnpm dev api game web     # a subset (api | game | chain | web | admin)
```

| Service | URL |
|---|---|
| Web client | http://localhost:5173 |
| Admin panel | http://localhost:5174 |
| API | http://localhost:3000 (`/health`, `/ready`, `/metrics`) |
| Game server | ws://localhost:2567 (`/health`, `/ready`, `/metrics` over HTTP) |
| Blockchain service | http://127.0.0.1:3100 (`/health`, `/ready`, `/metrics`) |

## 8. Running the Phaser client

```bash
pnpm dev:web              # Vite dev server on :5173, proxies /api → :3000
pnpm --filter @cryptoarena/web build && pnpm --filter @cryptoarena/web preview
```

The Phaser bundle is lazy-loaded when entering the arena. `VITE_GAME_URL` points to the Colyseus server.

## 9. Running the Colyseus server

```bash
pnpm dev:game             # tsx watch
pnpm --filter @cryptoarena/game-server build && pnpm --filter @cryptoarena/game-server start
pnpm exec tsx scripts/smoke-game.ts   # headless end-to-end check (needs API + game server)
```

Rooms: `arena_casual`, `arena_ranked`. Each room holds `maxClients`, map seed, tick rate, match phase
and the entity maps. Joining requires a single-use game ticket from `POST /api/game/ticket`.

## 10. Running the API

```bash
pnpm dev:api
pnpm --filter @cryptoarena/api build && pnpm --filter @cryptoarena/api start
```

Endpoints: `POST /api/auth/{nonce,verify,guest,refresh,logout}`, `GET /api/me`, `GET /api/profile`,
`POST /api/wallet/connect`, `GET /api/wallet`, `GET /api/wallet/ledger`, `POST /api/wallet/deposit/{prepare,verify}`,
`POST /api/wallet/withdraw`, `POST /api/wallet/withdraw/cancel`, `GET /api/inventory`,
`POST /api/inventory/{equip,unequip,upgrade}`, `GET /api/shop`, `POST /api/shop/purchase`,
`GET /api/characters`, `POST /api/characters/{unlock,upgrade}`, `GET /api/leaderboard?scope=GLOBAL|DAILY|WEEKLY|SEASON`,
`GET /api/quests`, `POST /api/quests/claim`, `POST /api/game/ticket`, and `/api/admin/*`.

## 11. Running the admin panel

```bash
pnpm dev:admin                                    # http://localhost:5174
pnpm admin:grant <username|wallet|userId> SUPER_ADMIN
```

Sign in with a wallet (or sign into the game client first — cookies are shared on the same host in
development), then grant yourself a role. Roles: `SUPER_ADMIN > ADMIN > MODERATOR > SUPPORT`. Every
admin mutation is written to the append-only audit log; financial changes are `ADMIN_ADJUSTMENT` journals.

## 12. Solana devnet setup

The first deployment **must** use devnet. The bootstrap script uses standard SPL Token instructions via
`@solana/kit` + `@solana-program/token` (no custom program):

```bash
pnpm devnet:setup --write-env
```

1. creates (or loads) the treasury keypair in `secrets/treasury.json` (git-ignored, mode 600),
2. requests a devnet airdrop (if the public faucet is rate-limited, fund the printed address at
   https://faucet.solana.com and re-run),
3. creates the reward mint (`REWARD_TOKEN_DECIMALS`), the treasury token account, and mints 10 M test tokens,
4. writes `SOLANA_MOCK=false`, `TREASURY_PUBLIC_KEY`, `TREASURY_SECRET`, `REWARD_TOKEN_MINT` into `.env`.

Give a player wallet test tokens and a little SOL for fees:

```bash
pnpm devnet:setup --fund <PLAYER_WALLET_ADDRESS> 100
```

Switch Phantom/Solflare/Backpack to **Devnet** in the wallet settings. Restart `pnpm dev`.

## 13. Wallet connection

1. The client asks `POST /api/auth/nonce` for a one-time nonce (5 min TTL).
2. The wallet signs the human-readable sign-in message (no transaction, no fee).
3. `POST /api/auth/verify` checks the ed25519 signature against the address (`@solana/kit`), consumes the
   nonce atomically (replay-proof) and creates the session.
4. The session is an HttpOnly, `SameSite=Lax` (and `Secure` in production) access cookie (15 min) plus a
   rotating refresh cookie (30 days, stored hashed, reuse revokes the whole session family).
5. Guests can later link a wallet (`POST /api/wallet/connect`, same signature flow); their progress is kept.

## 14. Deposit flow

1. `POST /api/wallet/deposit/prepare {amount}` — the server builds an SPL `transferChecked` from the
   user's token account to the treasury token account with a unique **reference key**, and stores a
   `Deposit` row (`AWAITING_SIGNATURE`).
2. The wallet signs and sends it (`wallet-adapter sendTransaction`).
3. `POST /api/wallet/deposit/verify {depositId, signature}` — the server binds the signature (unique
   index), then fetches the transaction and verifies: **network** (genesis hash at startup), **mint**,
   **exact amount**, **recipient** token account, **signer = linked wallet**, **reference key**, success,
   and **finality** (`SOLANA_COMMITMENT`). A foreign transaction is never bound to the wrong deposit.
4. Once finalized, a `DEPOSIT` journal (`idempotencyKey = deposit:<signature>`) credits the user's
   **spendable** crypto balance exactly once. A background job settles deposits whose verification
   was still pending.

*Testing a deposit (devnet):* fund your wallet with `pnpm devnet:setup --fund <addr> 100`, sign in with
that wallet, open **Wallet → Deposit Crypto**, enter an amount, approve in the wallet; the status turns
*CREDITED* after finalization (~15–30 s) and the ledger shows the `DEPOSIT` entry.
*Offline:* with `SOLANA_MOCK=true` the Deposit button simulates the broadcast.

## 15. Withdrawal flow

1. `POST /api/wallet/withdraw {amount, walletAddress, idempotencyKey}` checks: account active, not a guest,
   withdrawals not suspended, compliance (region / KYC hooks), **destination is a verified wallet of the
   account**, account age, min/max, **cooldown**, **daily limit**, available **withdrawable** balance
   (earned rewards only). Requests of one user are serialised with an advisory lock (race-free).
2. Funds move from `CRYPTO_REWARD` to the `WITHDRAWAL_CLEARING` account (hold) → status `PENDING`.
   Large amounts, high risk scores or recent anti-cheat flags set `requiresReview` (admin approval).
3. `blockchain-service` claims due rows with `FOR UPDATE SKIP LOCKED` → `PROCESSING`, builds and signs the
   transfer, **persists the signature before broadcasting**, sends, and polls.
4. Only when the signature is **finalized** is the withdrawal `COMPLETED` (settlement + fee journals).
   Failures are retried with backoff; a new transaction is built only after the previous one failed
   on-chain or its blockhash expired unseen, so **one withdrawal can never be paid twice**. After
   `WITHDRAWAL_MAX_ATTEMPTS` the hold is refunded (`FAILED`). Users can cancel while `PENDING`.
5. The transaction signature and an explorer link are shown in **Wallet → Withdrawals**.

*Testing a withdrawal (devnet):* earn rewards (PvP kills between two real accounts, quests with crypto
rewards, ranked top-3) or credit via admin (**Users → Adjust balance → CRYPTO_REWARD**, SUPER_ADMIN), set
`WITHDRAWAL_MIN_ACCOUNT_AGE_HOURS=0` and `WITHDRAWAL_COOLDOWN_SECONDS=0` for a quick test, then withdraw
from **Wallet**. Make sure `pnpm dev:chain` is running; check the signature on Solana Explorer (devnet).

## 16. Reward system

`amount = base × performance × event × season` (basis points, each clamped to ≤ 3×, integer math). Sources:
kill (PvP, real players only, per-pair cooldown, level-difference performance), quest, leaderboard
(top 10 of each finished daily/weekly board), daily/seasonal quests, tournament (ranked top 3), events
(world boss). Crypto rewards are paid from the `CRYPTO_REWARD_POOL` system account, which **cannot go
negative**, and are further capped by the season pool, the global daily budget (`REWARD_POOL` /
`dailyRewardBudget`) and the per-user daily cap — the engine can never mint unlimited tokens. Every
reward has a unique idempotency key; guests and restricted regions earn no crypto. See [`docs/ECONOMY.md`](docs/ECONOMY.md).

## 17. Anti-cheat

* Clients send only `MOVE/ATTACK/DASH/SKILL/ULT` intent (+ `pickup`, `buy_item`, `use_item`, `equip_item`).
* Movement vectors are clamped, NaN rejected; each input consumes one fixed step from a per-player
  **time budget**, so flooding inputs cannot increase speed (tested).
* Cooldowns, damage, crits, collision, XP, loot rolls, item ownership and rewards are server-side.
* Input rate limit (75/s), queue cap, strictly increasing sequence numbers (replay), zod-validated
  payloads, unknown message types, pickup/merchant range checks, loot claim locks (no duplicate pickup),
  loot owner lock, single-use game tickets, one live character per account, reconnect grace window with
  HP/cooldown carry-over (no reset abuse), bot-like input timing detector, PvP farming cooldowns.
* Violations are counted, logged (`ANTICHEAT_FLAG`), persisted (`AntiCheatFlag`, user risk score) and
  can trigger kicks and withdrawal review.

## 18. Testing

```bash
pnpm typecheck                  # strict TypeScript for every package + scripts/tests
pnpm lint                       # ESLint (typescript-eslint, react-hooks)
pnpm test                       # unit tests (game-core, blockchain, config, shared, simulation)
pnpm test:integration           # real PostgreSQL: ledger, deposits, withdrawals, rewards, shop, API
pnpm test:all                   # both
pnpm test:e2e                   # Playwright demo flow (starts API, game server and web)
```

Integration tests create a **fresh, uniquely named database** from `DATABASE_URL_TEST` per run
(`prisma migrate deploy` + seed) and drop only that database afterwards — existing databases are never
reset. Covered cases include duplicate deposit, transaction replay, signature squatting, duplicate
withdrawal, withdrawal race, double payment on broadcast failure, max-attempt refund, double reward,
reward budget caps, insufficient balance, invalid wallet signature, nonce replay, refresh-token reuse,
CSRF, unauthorized admin, invalid purchase, speed hack, impossible attack speed, duplicate pickup and
concurrent ledger debits. Set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright should use a preinstalled Chromium.

## 19. Docker

```bash
docker compose up -d postgres redis              # infrastructure only
docker compose --profile apps up --build         # migrate + api + game-server + blockchain-service + web + admin
```

Web: http://localhost:8080 · Admin: http://localhost:8081 · API: http://localhost:3000 · Game: ws://localhost:2567.
`TREASURY_SECRET` is passed to the `blockchain-service` container only.

## 20. Production deployment

* **Frontend (web/admin):** static builds (`pnpm --filter @cryptoarena/web build`) on Vercel or
  Cloudflare Pages; route `/api/*` to the API through the same domain (or set `VITE_API_URL` +
  `COOKIE_DOMAIN`) so cookies stay first-party; set `VITE_GAME_URL=wss://game.example.com`.
* **API / game server / blockchain-service:** `docker/node.Dockerfile` images on a VPS or container
  platform behind TLS (Caddy/nginx/Traefik). Set `TRUST_PROXY_HOPS`. Run the game server with sticky
  WebSockets; for several game nodes switch Colyseus to Redis presence/driver.
* **Database:** managed PostgreSQL (backups, PITR). Run `pnpm db:deploy` in the release pipeline.
* **Redis:** managed Redis for rate limiting (`REDIS_URL`).
* **RPC:** a dedicated Solana RPC provider via `SOLANA_RPC_URL`.
* **Secrets:** use a secret manager; production treasury signing should move to KMS/HSM (implement
  `TreasurySigner` in `packages/blockchain/src/signer.ts`). Keep hot-wallet balances small.
* **Monitoring:** scrape `/metrics` (Prometheus), alert on `withdrawal_queue_size`, `http_errors_total`,
  `solana_rpc_latency_ms`, ledger imbalance (admin overview) and `anticheat_flags_total`.
* Mainnet requires `NODE_ENV=production` + `ALLOW_MAINNET=true` and a legal/compliance review.
  See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`.env.production.example`](.env.production.example).

## 21. Security

OWASP-aligned controls: wallet-signature authentication with single-use nonces, short-lived JWT in
HttpOnly cookies, rotating refresh tokens with reuse detection, double-submit CSRF tokens + Origin
allow-list, helmet headers and strict CSP on the API, per-user/IP rate limiting (Redis-backed), Zod
validation of every input, Prisma parameterised queries (no string SQL), React output escaping,
server-side role checks for every admin route, audit logging, idempotency keys on every financial
operation, database-enforced immutability and non-negative balances, secret redaction in logs, the
treasury key isolated in `blockchain-service`, devnet by default and mainnet guarded by configuration.
Details and the threat model: [`docs/SECURITY.md`](docs/SECURITY.md).

## 22. Future smart-contract architecture

The MVP uses plain SPL token transfers (no custom program). The chain layer is isolated behind
`SolanaGateway` / `TreasurySigner` so an Anchor program can be added without touching game code:
escrowed deposits, on-chain reward claims with Merkle proofs per season, NFT items via Metaplex Token
Metadata, and an on-chain marketplace. See [`docs/SMART_CONTRACTS.md`](docs/SMART_CONTRACTS.md).

## 23. Developer tooling

* **Graphify** (`repos/graphify-labs-graphify`): `pnpm graph` builds a local tree-sitter knowledge graph of
  the codebase in `graphify-out/` (no LLM, nothing leaves the machine). Useful queries:
  `graphify explain "postJournal" --graph graphify-out/graph.json`,
  `graphify path "ArenaRoom" "grantReward" --graph graphify-out/graph.json --undirected`.
  It was used to study the reference repos (e.g. `docs/reference-graphs/tosios`) and to verify that only
  `blockchain-service` reaches the treasury signer ([`docs/architecture/GRAPH_REPORT.md`](docs/architecture/GRAPH_REPORT.md)).
* **CodeRabbit skills** (`repos/coderabbitai-skills`, installed in `.claude/skills/coderabbit-*`): with the
  CodeRabbit CLI installed and authenticated (`https://docs.coderabbit.ai/cli`), ask your coding agent to
  "review my code" or run `coderabbit review --agent`; the `autofix` skill applies review-thread
  feedback on PRs. Repository instructions for agents are in [`AGENTS.md`](AGENTS.md).

## 24. Third-party code & licenses

No third-party source code was copied verbatim; patterns were studied and re-implemented.

| Project | License | How it is used |
|---|---|---|
| [phaserjs/phaser](https://github.com/phaserjs/phaser) | MIT | npm dependency (`phaser@4`), rendering |
| [colyseus/colyseus](https://github.com/colyseus/colyseus) | MIT | npm dependencies (`@colyseus/core`, `schema`, `ws-transport`, `sdk`); StateView, fixed-step patterns |
| [colyseus/tutorial-phaser](https://github.com/colyseus/tutorial-phaser) | MIT (per package.json) | Pattern reference: input queue, fixed tick, prediction + interpolation |
| [halftheopposite/tosios](https://github.com/halftheopposite/tosios) | MIT | Pattern reference: NPC FSM, wall collision correction, ghost/ack reconciliation |
| [knagaitsev/io-template](https://github.com/knagaitsev/io-template) | no license file | Concept reference only (single-command dev loop); no code used |
| [anza-xyz/kit](https://github.com/anza-xyz/kit) | MIT | npm dependency (`@solana/kit`, `@solana-program/*`) |
| [anza-xyz/wallet-adapter](https://github.com/anza-xyz/wallet-adapter) | Apache-2.0 | npm dependency (wallet connection UI) |
| [metaplex-foundation/mpl-token-metadata](https://github.com/metaplex-foundation/mpl-token-metadata) | Metaplex NFT Open Source License | Not used in the MVP; planned for NFT items (review license before use) |
| [solana-foundation/anchor](https://github.com/solana-foundation/anchor) | Apache-2.0 | Not used in the MVP; planned for future programs |
| [prisma/orm](https://github.com/prisma/orm) | Apache-2.0 | npm dependency (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | Apache-2.0 / MIT | Developer tool (code graph) |
| [coderabbitai/skills](https://github.com/coderabbitai/skills) | MIT | Agent skills copied into `.claude/skills/` with their LICENSE |

Other notable dependencies (all MIT unless noted): React, Vite, Tailwind CSS, Fastify (+ plugins), Zod,
jose, pino, prom-client (Apache-2.0), ioredis, zustand, pg, vitest, Playwright (Apache-2.0), esbuild,
typescript-eslint, TypeScript (Apache-2.0).

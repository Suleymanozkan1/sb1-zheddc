# Architecture

## Services

| Service | Responsibility | Talks to |
|---|---|---|
| `apps/web` | React dashboard + Phaser arena, wallet-adapter | API (REST, cookies), game server (WebSocket) |
| `apps/admin` | Admin panel | API `/api/admin/*` |
| `apps/api` | Auth, wallet (deposit prepare/verify, withdraw request), shop, inventory, characters, quests, leaderboard, admin, background jobs | PostgreSQL, Redis, Solana RPC (read-only) |
| `apps/game-server` | Colyseus rooms, authoritative simulation, persistence of results | PostgreSQL (via economy package) |
| `apps/blockchain-service` | Withdrawal queue worker, the only holder of the treasury signer | PostgreSQL, Solana RPC (send) |

## Game loop

* `ArenaSimulation` (`apps/game-server/src/sim/simulation.ts`) is framework-free and unit tested.
* 60 Hz fixed step (`GAME_TICK_RATE`), 20 Hz schema patches (`GAME_PATCH_RATE_MS`).
* Per tick: rebuild spatial grids → consume at most the allowed inputs per player (time budget) → movement
  (`game-core/movement.ts`), attacks, abilities → NPC AI for awake NPCs (players within 1 700 units) →
  projectiles, meteors → world (loot expiry, respawn queue).
* `ArenaRoom` mirrors the simulation into `ArenaState` (players/npcs/projectiles/loot/resources maps,
  `.view()`-tagged) and refreshes each client's `StateView` every 200 ms around its player. Projectiles
  are sent once (position + velocity) and extrapolated client-side.
* Events (`player_damage`, `player_attack`, `item_drop`, …) are only sent to clients near the event.
* Progress (XP, gold, kills, quest counters, leaderboard) is flushed every 20 s and on leave with a
  monotonic flush sequence → idempotent journals.

## Client

* `ArenaScene` renders a deterministic map generated from the room's seed, predicts the local player with
  the shared `stepMovement`, reconciles to `ack` (last processed input), smooths corrections, and
  interpolates remote entities from a snapshot buffer (100 ms delay).
* `InputSource` abstracts keyboard/mouse and twin-stick touch controls.
* HUD is React (zustand store written by the scene).

## Data model (Prisma)

Identity: `User`, `Session`, `Wallet`, `WalletNonce`, `AdminUser`, `AuditLog`.
Game: `Character`, `CharacterStats`, `UserCharacter`, `CharacterUpgrade`, `Item`, `InventoryItem`,
`GameMatch`, `GameMatchPlayer`, `Quest`, `UserQuest`, `Season`, `Leaderboard`, `LeaderboardEntry`.
Economy: `ShopProduct`, `Purchase`, `BalanceAccount`, `LedgerJournal`, `BalanceLedger`, `Reward`,
`RewardClaim`, `Deposit`, `Withdrawal`, `WalletTransaction`. Safety: `AntiCheatFlag`, `ComplianceRule`, `FeatureFlag`.

## Scaling notes

* API and blockchain-service are stateless (multiple instances are safe: jobs use advisory locks,
  withdrawals use `SKIP LOCKED`).
* The game server keeps per-process registries (active users, recent leavers). For several game nodes use
  Colyseus Redis presence/driver and move those registries to Redis.

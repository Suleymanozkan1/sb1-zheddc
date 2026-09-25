# Graph Report - cryptoarena  (2026-09-25)

## Corpus Check
- 180 files · ~82,551 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: .css 3, .toml 1, .prisma 1)

## Summary
- 1640 nodes · 3358 edges · 91 communities (85 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- api/src/auth.ts
- src/api.ts
- admin/package.json
- api/package.json
- rewards.ts
- ref_react
- admin/src/lib/api.ts
- ArenaSimulation
- ArenaScene
- validation/src/index.ts
- Gate.tsx
- ArenaRoom
- withdrawals.ts
- actions.tsx
- admin/src/App.tsx
- database/package.json
- blockchain-service/package.json
- inventory.ts
- constants.ts
- ref_cryptoarena_shared
- economy/package.json
- game-core.test.ts
- ArenaRoom.ts
- web/package.json
- common.tsx
- map.ts
- observability/package.json
- simulation.ts
- SimEvents
- AppError
- deposits.ts
- store.ts
- kit-gateway.ts
- movement.ts
- Persistence
- ref_cryptoarena_database
- blockchain/package.json
- ledger.ts
- ui/package.json
- index.tsx
- game-server/package.json
- blockchain.test.ts
- game-core/src/stats.ts
- dependencies
- config/src/index.ts
- Overview.tsx
- MockSolanaGateway
- validation/package.json
- dependencies
- config/package.json
- StaticGrid
- graph.mjs
- devnet-setup.ts
- ListView.tsx
- game-server/src/main.ts
- game-core/package.json
- GameConnection
- game-core/src/index.ts
- items.ts
- shared/package.json
- SolanaGateway
- KitSolanaGateway
- npcs.ts
- admin/tsconfig.json
- web/tsconfig.json
- transactions.ts
- math.ts
- global-setup.ts
- devDependencies
- ui/tsconfig.json
- api/tsconfig.json
- blockchain-service/tsconfig.json
- BotController
- game-server/tsconfig.json
- CharacterCard.tsx
- web/src/lib/api.ts
- blockchain/tsconfig.json
- config/tsconfig.json
- database/tsconfig.json
- economy/tsconfig.json
- game-core/tsconfig.json
- observability/tsconfig.json
- shared/tsconfig.json
- validation/tsconfig.json
- admin/vite.config.ts
- scripts
- scripts
- dev.mjs
- devDependencies
- signer.ts
- ref_playwright_test

## God Nodes (most connected - your core abstractions)
1. `ArenaSimulation` - 53 edges
2. `AppError` - 45 edges
3. `ArenaRoom` - 36 edges
4. `SimPlayer` - 33 edges
5. `useApp` - 30 edges
6. `useSession()` - 27 edges
7. `postJournal()` - 25 edges
8. `ArenaScene` - 24 edges
9. `transfer()` - 24 edges
10. `Persistence` - 22 edges

## Surprising Connections (you probably didn't know these)
- `consumeItem()` --calls--> `AppError`  [EXTRACTED]
  packages/economy/src/inventory.ts → packages/economy/src/errors.ts
- `App()` --calls--> `errorMessage()`  [EXTRACTED]
  apps/admin/src/App.tsx → apps/admin/src/lib/api.ts
- `Console()` --calls--> `errorMessage()`  [EXTRACTED]
  apps/admin/src/App.tsx → apps/admin/src/lib/api.ts
- `Console()` --calls--> `hasRole()`  [EXTRACTED]
  apps/admin/src/App.tsx → apps/admin/src/lib/roles.ts
- `SetRoleBody()` --calls--> `useSession()`  [EXTRACTED]
  apps/admin/src/components/actions.tsx → apps/admin/src/lib/session.tsx

## Import Cycles
- None detected.

## Communities (91 total, 6 thin omitted)

### Community 0 - "api/src/auth.ts"
Cohesion: 0.06
Nodes (68): buildApp(), authenticate(), AuthUser, checkCsrf(), clearSessionCookies(), COOKIE_ACCESS, COOKIE_CSRF, COOKIE_REFRESH (+60 more)

### Community 1 - "src/api.ts"
Cohesion: 0.06
Nodes (53): ApiError, BalancesDto, CharacterDto, DepositDto, InventoryItemDto, ItemDto, LeaderboardDto, LeaderboardRowDto (+45 more)

### Community 2 - "admin/package.json"
Cohesion: 0.05
Nodes (43): dependencies, buffer, @cryptoarena/shared, @cryptoarena/ui, react, react-dom, @solana/kit, @solana/wallet-adapter-base (+35 more)

### Community 3 - "api/package.json"
Cohesion: 0.05
Nodes (42): dependencies, @cryptoarena/blockchain, @cryptoarena/config, @cryptoarena/database, @cryptoarena/economy, @cryptoarena/game-core, @cryptoarena/observability, @cryptoarena/shared (+34 more)

### Community 4 - "rewards.ts"
Cohesion: 0.11
Nodes (33): addCharacterXp(), evaluateFeature(), arenaScore(), boardFor(), distributeLeaderboardRewards(), getLeaderboard(), LEADERBOARD_SHARES_BPS, MatchStatsDelta (+25 more)

### Community 5 - "ref_react"
Cohesion: 0.20
Nodes (28): NAV, Page(), Toasts(), TopBar(), api, newKey(), CURRENCY_ICON, price() (+20 more)

### Community 6 - "admin/src/lib/api.ts"
Cohesion: 0.09
Nodes (37): ApiError, csrfToken(), list(), qs(), refreshSession(), request(), AdjustAccount, AdminUserRow (+29 more)

### Community 7 - "ArenaSimulation"
Cohesion: 0.14
Nodes (3): ArenaSimulation, SimNpc, SimPlayer

### Community 8 - "ArenaScene"
Cohesion: 0.08
Nodes (6): ArenaScene, colorOf(), InputSource, KeyboardMouseInput, TouchInput, PlayerView

### Community 9 - "validation/src/index.ts"
Cohesion: 0.05
Nodes (37): adminAdjustRequest, adminFundPoolRequest, adminGrantItemRequest, adminLeaderboardDistributeRequest, adminListQuery, adminProductUpdateRequest, adminReason, adminRefundRequest (+29 more)

### Community 10 - "Gate.tsx"
Cohesion: 0.09
Nodes (23): App(), LoginScreen(), NotAuthorized(), apps_admin_src_index, Ctx, Kind, Toast, ToastProvider() (+15 more)

### Community 11 - "ArenaRoom"
Cohesion: 0.14
Nodes (3): ArenaRoom, emptyProgress(), pruneExpired()

### Community 12 - "withdrawals.ts"
Cohesion: 0.12
Nodes (26): getUserBalances(), grantCharacter(), upgradeCharacterStat(), requireFeature(), postJournal(), transfer(), isPositiveInt(), parseProductMetadata() (+18 more)

### Community 13 - "actions.tsx"
Cohesion: 0.13
Nodes (28): ACCOUNT_LABEL, AdjustBalanceBody(), AdjustBalanceModal(), checkDecimal(), Closeable, DistributeBody(), DistributeModal(), EditProductBody() (+20 more)

### Community 14 - "admin/src/App.tsx"
Cohesion: 0.18
Nodes (23): AuthState, SECTION_MIN, VIEWS, dt(), Session, SessionCtx, TokenMeta, AntiCheat() (+15 more)

### Community 15 - "database/package.json"
Cohesion: 0.07
Nodes (23): dependencies, pg, @prisma/adapter-pg, @prisma/client, devDependencies, @types/pg, exports, name (+15 more)

### Community 16 - "blockchain-service/package.json"
Cohesion: 0.08
Nodes (25): dependencies, @cryptoarena/blockchain, @cryptoarena/config, @cryptoarena/database, @cryptoarena/economy, @cryptoarena/observability, @solana/kit, devDependencies (+17 more)

### Community 17 - "inventory.ts"
Cohesion: 0.15
Nodes (20): AbilityJson, characterBaseFromRow(), parseItemStats(), listCharacters(), loadCharacterForMatch(), skillDto(), upgradesRecord(), consumeItem() (+12 more)

### Community 18 - "constants.ts"
Cohesion: 0.10
Nodes (20): DASH_COOLDOWN_MS, MAX_INPUT_QUEUE, MAX_INPUTS_PER_SECOND, MAX_ITEM_UPGRADE, MAX_LEVEL, MAX_STAT_POINTS_PER_STAT, MERCHANT_RADIUS, PICKUP_RADIUS (+12 more)

### Community 19 - "ref_cryptoarena_shared"
Cohesion: 0.13
Nodes (15): PendingInput, RemoteBody, Snapshot, InputFrame, isTouchDevice(), Handler, generateTextures(), LootView (+7 more)

### Community 20 - "economy/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @cryptoarena/blockchain, @cryptoarena/config, @cryptoarena/database, @cryptoarena/game-core, @cryptoarena/observability, @cryptoarena/shared, @solana/kit (+15 more)

### Community 21 - "game-core.test.ts"
Cohesion: 0.08
Nodes (23): packages_game_core_src_index_botbehaviordetector, packages_game_core_src_index_builditemcatalog, packages_game_core_src_index_computecombatstats, packages_game_core_src_index_dash_distance, packages_game_core_src_index_generatearena, packages_game_core_src_index_getcharacterdef, packages_game_core_src_index_isvalidseq, packages_game_core_src_index_itemupgradecost (+15 more)

### Community 22 - "ArenaRoom.ts"
Cohesion: 0.13
Nodes (20): activeUsers, ArenaClient, buySchema, ClientData, inventoryIdSchema, MERCHANT_SKUS, moveSchema, pickupSchema (+12 more)

### Community 23 - "web/package.json"
Cohesion: 0.09
Nodes (22): buffer, @colyseus/sdk, @cryptoarena/game-core, @cryptoarena/shared, @cryptoarena/ui, react, react-dom, @solana/kit (+14 more)

### Community 24 - "common.tsx"
Cohesion: 0.15
Nodes (19): ActionModal(), ActionModalBody(), ActionModalProps, Addr(), Badge(), Field(), JsonCell(), Mono() (+11 more)

### Community 25 - "map.ts"
Cohesion: 0.13
Nodes (10): WORLD_SIZE, rollLoot(), cache, generateArena(), randomFreePoint(), Region, REGIONS, Zone (+2 more)

### Community 26 - "observability/package.json"
Cohesion: 0.10
Nodes (17): dependencies, pino, prom-client, devDependencies, exports, name, private, scripts (+9 more)

### Community 27 - "simulation.ts"
Cohesion: 0.14
Nodes (15): BotMode, BotState, NAMES, AddPlayerInput, InputRejection, SimulationOptions, Buff, Killer (+7 more)

### Community 29 - "AppError"
Cohesion: 0.22
Nodes (17): AdjustableAccount, adjustBalance(), AdminActor, adminFundRewardPool(), adminGrantItem(), hasRole(), requireRole(), ROLE_RANK (+9 more)

### Community 30 - "deposits.ts"
Cohesion: 0.15
Nodes (14): ComplianceSubject, FEATURE_FLAGS, EconomyContext, assertDepositsConfigured(), prepareDeposit(), processPendingDeposits(), randomReference(), settleDeposit() (+6 more)

### Community 31 - "store.ts"
Cohesion: 0.15
Nodes (14): GameView, Hud(), Minimap(), FloatingNotice, HudState, initial, MinimapDot, useHud (+6 more)

### Community 32 - "kit-gateway.ts"
Cohesion: 0.20
Nodes (12): ParsedAccountKey, ParsedTokenBalance, ParsedTxResponse, RpcObserver, Commitment, DepositExpectation, DepositVerification, GENESIS_HASHES (+4 more)

### Community 33 - "movement.ts"
Cohesion: 0.15
Nodes (16): CircleBody, circleOverlapsBody(), RectBody, resolveCircle(), StaticBody, DASH_DISTANCE, DASH_DURATION_MS, PLAYER_RADIUS (+8 more)

### Community 35 - "ref_cryptoarena_database"
Cohesion: 0.12
Nodes (13): ADJECTIVES, createUser(), NOUNS, randomUsername(), WELCOME_GOLD, config, prisma, PRODUCTS (+5 more)

### Community 36 - "blockchain/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @cryptoarena/shared, @solana/kit, @solana-program/system, @solana-program/token, devDependencies, exports, @cryptoarena/shared (+8 more)

### Community 37 - "ledger.ts"
Cohesion: 0.15
Nodes (13): AccountRef, ensureSystemAccounts(), resolveAccount(), ResolvedAccount, SYSTEM_ACCOUNTS, SystemAccountKey, USER_ACCOUNT_ASSET, UserAccountKind (+5 more)

### Community 38 - "ui/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @cryptoarena/shared, react, devDependencies, @types/react, exports, ./theme.css, @cryptoarena/shared (+8 more)

### Community 39 - "index.tsx"
Cohesion: 0.15
Nodes (8): Button(), cx(), Panel(), ProgressBar(), SIZES, Spinner(), Variant, VARIANTS

### Community 40 - "game-server/package.json"
Cohesion: 0.12
Nodes (15): @colyseus/sdk, @cryptoarena/config, @cryptoarena/database, @cryptoarena/economy, @cryptoarena/game-core, @cryptoarena/observability, @cryptoarena/shared, esbuild (+7 more)

### Community 41 - "blockchain.test.ts"
Cohesion: 0.14
Nodes (13): buildSignInMessage(), isValidSolanaAddress(), verifyWalletSignature(), packages_blockchain_src_index_builddeposittransaction, packages_blockchain_src_index_buildsignedwithdrawaltransaction, packages_blockchain_src_index_buildsigninmessage, packages_blockchain_src_index_depositexpectation, packages_blockchain_src_index_getassociatedtokenaddress (+5 more)

### Community 42 - "game-core/src/stats.ts"
Cohesion: 0.16
Nodes (14): AbilityDef, AbilityEffect, CharacterBase, CharacterDef, CHARACTERS, getCharacterDef(), STAT_CAPS, itemUpgradeMultiplier() (+6 more)

### Community 43 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, buffer, @colyseus/sdk, @cryptoarena/game-core, @cryptoarena/shared, @cryptoarena/ui, phaser, react (+7 more)

### Community 44 - "config/src/index.ts"
Cohesion: 0.19
Nodes (12): AppConfig, bigintStr, bool, ConfigError, envSchema, getConfig(), loadEnvFiles(), NETWORKS (+4 more)

### Community 45 - "Overview.tsx"
Cohesion: 0.22
Nodes (12): Console(), FundPoolModal(), Loading(), api, href(), navigate(), parse(), Route (+4 more)

### Community 46 - "MockSolanaGateway"
Cohesion: 0.16
Nodes (4): createSolanaGateway(), MockSolanaGateway, SolanaNetwork, landed()

### Community 47 - "validation/package.json"
Cohesion: 0.14
Nodes (13): dependencies, @cryptoarena/shared, zod, devDependencies, exports, @cryptoarena/shared, zod, name (+5 more)

### Community 48 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, @colyseus/core, @colyseus/schema, @colyseus/ws-transport, @cryptoarena/config, @cryptoarena/database, @cryptoarena/economy, @cryptoarena/game-core (+5 more)

### Community 49 - "config/package.json"
Cohesion: 0.15
Nodes (12): dependencies, dotenv, zod, devDependencies, exports, zod, name, private (+4 more)

### Community 50 - "StaticGrid"
Cohesion: 0.22
Nodes (4): bodyBounds(), cellKey(), DynamicGrid, StaticGrid

### Community 51 - "graph.mjs"
Cohesion: 0.17
Nodes (7): ref_esbuild, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, [entry = "src/main.ts", outfile = "dist/main.js"], stage

### Community 52 - "devnet-setup.ts"
Cohesion: 0.32
Nodes (12): ata(), confirm(), createMint(), DECIMALS, ensureSol(), generateExtractableKeypairBytes(), loadTreasury(), main() (+4 more)

### Community 53 - "ListView.tsx"
Cohesion: 0.24
Nodes (10): GrantItemBody(), ErrorBox(), ListConfig, ListView(), PAGE_SIZES, Paging, useDebounced(), errorMessage() (+2 more)

### Community 54 - "game-server/src/main.ts"
Cohesion: 0.21
Nodes (7): RoomDeps, main(), TicketVerifier, @colyseus/core, @colyseus/ws-transport, express, ref_jose

### Community 55 - "game-core/package.json"
Cohesion: 0.17
Nodes (11): dependencies, @cryptoarena/shared, devDependencies, exports, @cryptoarena/shared, name, private, scripts (+3 more)

### Community 56 - "GameConnection"
Cohesion: 0.27
Nodes (3): GameView(), GameConnection, ArenaStateView

### Community 57 - "game-core/src/index.ts"
Cohesion: 0.18
Nodes (3): BotBehaviorDetector, isValidSeq(), RateWindow

### Community 58 - "items.ts"
Cohesion: 0.20
Nodes (10): buildItemCatalog(), EQUIPMENT, ItemDef, LOOT_RARITY_WEIGHTS, LootCandidate, RARITY_DROP_WEIGHT, RARITY_LEVEL, RARITY_MULT (+2 more)

### Community 59 - "shared/package.json"
Cohesion: 0.20
Nodes (9): dependencies, devDependencies, exports, name, private, scripts, typecheck, type (+1 more)

### Community 62 - "npcs.ts"
Cohesion: 0.22
Nodes (7): NPC_POPULATION, NpcBehavior, NpcDef, NPCS, RESOURCE_POPULATION, ResourceDef, RESOURCES

### Community 63 - "admin/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 64 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 65 - "transactions.ts"
Cohesion: 0.36
Nodes (7): buildDepositTransaction(), buildSignedWithdrawalTransaction(), DepositTxInput, getAssociatedTokenAddress(), WithdrawalTxInput, withReference(), @solana-program/token

### Community 66 - "math.ts"
Cohesion: 0.32
Nodes (4): angleDiff(), dist(), dist2(), lerpAngle()

### Community 67 - "global-setup.ts"
Cohesion: 0.29
Nodes (4): dotenv, pg, ProvidedContext, vitest

### Community 68 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, vite, @vitejs/plugin-react

### Community 69 - "ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, jsx, lib, extends, include, ../../tsconfig.base.json

### Community 70 - "api/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 71 - "blockchain-service/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 73 - "game-server/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 74 - "CharacterCard.tsx"
Cohesion: 0.47
Nodes (5): Avatar(), CharacterCard(), characterColor(), hex(), StatsGrid()

### Community 75 - "web/src/lib/api.ts"
Cohesion: 0.53
Nodes (4): ApiError, csrfToken(), refreshSession(), request()

### Community 76 - "blockchain/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 77 - "config/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 78 - "database/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 79 - "economy/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 80 - "game-core/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 81 - "observability/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 82 - "shared/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 83 - "validation/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 84 - "admin/vite.config.ts"
Cohesion: 0.60
Nodes (3): ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 85 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, typecheck

### Community 86 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, typecheck

### Community 87 - "dev.mjs"
Cohesion: 0.40
Nodes (3): children, only, services

### Community 88 - "devDependencies"
Cohesion: 0.50
Nodes (4): devDependencies, @colyseus/sdk, esbuild, @types/express

### Community 89 - "signer.ts"
Cohesion: 0.67
Nodes (3): createEnvTreasurySigner(), parseSecretKey(), TreasurySigner

## Knowledge Gaps
- **587 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+582 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 748 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ArenaRoom` connect `ArenaRoom` to `BotController`, `game-server/src/main.ts`, `ArenaRoom.ts`, `ArenaSimulation`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `pg` connect `global-setup.ts` to `database/package.json`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `ArenaSimulation` connect `ArenaSimulation` to `BotController`, `ArenaRoom`, `ArenaRoom.ts`, `simulation.ts`, `SimEvents`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _587 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api/src/auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05996212918156953 - nodes in this community are weakly interconnected._
- **Should `src/api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059562841530054644 - nodes in this community are weakly interconnected._
- **Should `admin/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
# Economy

## Currencies

| Asset | Nature | Earned by | Spent on |
|---|---|---|---|
| GOLD | off-chain | gameplay (kills, resources, chests, quests), welcome bonus | item upgrades, stat upgrades, merchant, some shop items |
| GEMS | off-chain premium | purchased with deposited crypto, some quests | characters, skins, premium pass, boosts |
| CRYPTO | SPL token (devnet) | deposits (spendable) · gameplay rewards (withdrawable) | shop (spendable first, then rewards) · withdrawal (rewards only) |

Deposited crypto is **spend-only** (shop). Only rewards earned through gameplay are withdrawable. This keeps
the product a game — you cannot deposit, "invest" and withdraw more later.

## Double-entry ledger

* `BalanceAccount` per user (`GOLD`, `GEMS`, `CRYPTO_SPENDABLE`, `CRYPTO_REWARD`) and system accounts:
  `GOLD_ISSUANCE`, `GOLD_SINK`, `GEMS_ISSUANCE`, `GEMS_SINK`, `CRYPTO_EXTERNAL` (mirror of on-chain flows),
  `CRYPTO_REVENUE`, `CRYPTO_REWARD_POOL`, `CRYPTO_WITHDRAWAL_CLEARING`, `CRYPTO_FEES`.
* `LedgerJournal` (unique `idempotencyKey`) + ≥ 2 `BalanceLedger` rows (`DEBIT`/`CREDIT`, positive amount,
  `balanceAfter`, `type`, `asset`, `reference`, `status`, `metadata`). Debits = credits per asset.
* Account rows are locked in id order (`FOR UPDATE`), the cached balance is updated in the same transaction,
  and a CHECK constraint forbids negative user balances. Triggers block UPDATE/DELETE/TRUNCATE.
* Corrections are new journals (`REFUND`, `ADMIN_ADJUSTMENT`). The admin overview shows the global
  imbalance per asset, which must always be 0.

| Flow | Journal |
|---|---|
| Deposit | `CRYPTO_EXTERNAL → user CRYPTO_SPENDABLE` (DEPOSIT) |
| Reward | `CRYPTO_REWARD_POOL → user CRYPTO_REWARD` (GAME_REWARD) |
| Purchase | `user → *_SINK / CRYPTO_REVENUE` (PURCHASE) |
| Withdrawal request | `user CRYPTO_REWARD → CLEARING` (WITHDRAWAL, hold) |
| Withdrawal completed | `CLEARING → CRYPTO_EXTERNAL` (WITHDRAWAL) + `CLEARING → CRYPTO_FEES` (WITHDRAWAL_FEE) |
| Withdrawal failed/cancelled | `CLEARING → user CRYPTO_REWARD` (REFUND) |
| Season start | `CRYPTO_EXTERNAL → CRYPTO_REWARD_POOL` (POOL_FUNDING) |

## Reward budgets

A crypto reward is the minimum of the multiplied amount and:

1. the reward pool balance (funded per season; can never go negative),
2. the season pool minus what the season already paid,
3. the global daily budget (`min(REWARD_POOL, season.dailyRewardBudget)`) minus today's payouts,
4. the per-user daily cap (`USER_DAILY_REWARD_CAP`).

The pool row is locked first, so concurrent grants cannot exceed budgets. Result status is
`GRANTED`, `CAPPED` or `REJECTED` (with reason) and is stored with the multipliers used.

### Anti-farming rules (game server)

* **PvP kills** pay crypto only when the victim is a non-guest account at or above
  `PVP_REWARD_MIN_VICTIM_LEVEL`, at most once per `PVP_SAME_VICTIM_COOLDOWN_SECONDS` per pair, and each
  earlier paid kill of the same victim today multiplies the next by `PVP_REPEAT_DECAY_BPS`.
* **Ranked top 3** pays only with at least `RANKED_REWARD_MIN_HUMANS` real players, scaled 50 % → 100 %
  up to `RANKED_REWARD_FULL_HUMANS`.
* **Crystal Titan** pays `TITAN_REWARD_BASE` split by damage share among contributors with at least
  `TITAN_MIN_DAMAGE_SHARE_BPS`, and at most `TITAN_REWARDS_PER_USER_DAY` boss rewards per user per day.
* Per-day counts are read from the `Reward` table inside the user's serialized persistence queue, so
  they hold across rooms and processes. See `docs/ECONOMY_BALANCE.md` for the numbers.

## Premium

FREE / VIP / ELITE passes grant XP boosts, extra quests (premium-gated quests), inventory slots and
cosmetic access. Premium never pays out money and never changes reward budgets.

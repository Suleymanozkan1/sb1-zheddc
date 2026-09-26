# Security

## Threat model (summary)

| Threat | Control |
|---|---|
| Client-side cheating (speed, damage, teleport, reward forging) | Intent-only protocol; server computes everything; time-budgeted input consumption; clamping; cooldowns; range checks |
| Packet spam / flooding | Per-client rate windows, queue caps, violation counter → kick + persisted flag |
| Replay (inputs, tickets, nonces, transactions) | Monotonic input seq; single-use ticket `jti`; atomic nonce consumption; unique deposit signature + reference key |
| Duplicate reward / pickup / purchase / withdrawal | Idempotency keys with unique indexes on every financial operation; loot claim lock; advisory lock per user for withdrawals |
| Race conditions on balances | Row locks in deterministic order; CHECK (balance ≥ 0); serialisable retries |
| Double payment on-chain | Signature persisted before broadcast; rebuild only after on-chain failure or blockhash expiry; completion only at finality |
| Deposit fraud | Server-built transaction; verification of network (genesis hash), mint, exact amount, recipient ATA, signer, reference, success, finality; foreign signatures never bound |
| Session theft / CSRF / XSS | HttpOnly cookies, SameSite=Lax, Secure in prod, double-submit CSRF token, Origin allow-list, CSP via helmet, React escaping, no `dangerouslySetInnerHTML` |
| Refresh token theft | Hashed storage, rotation, reuse detection revokes the family |
| SQL injection | Prisma parameterised queries; raw SQL only via tagged templates |
| Privilege escalation | Server-side role checks on every admin route; admins cannot modify equal/higher roles; audited |
| Key leakage | Treasury key only in blockchain-service env; never logged (pino redaction), never in DB/browser/git (`secrets/` ignored) |
| Wrong network | Genesis-hash check at startup; mainnet requires explicit production opt-in |
| Account takeover → withdrawal | Withdrawals only to wallets verified on the account; account age; cooldown; daily limit; review thresholds |

## Operational checklist

- Rotate `JWT_SECRET` → invalidates all sessions and tickets.
- Keep treasury hot-wallet balance low; top up from cold storage.
- Monitor `withdrawal_queue_size`, RPC latency, ledger imbalance, anti-cheat flags.
- Review `AuditLog` for `BALANCE_ADJUST`, `REWARD_POOL_FUND`, `ADMIN_ROLE_SET*`.
- Compliance: configure `BLOCKED_COUNTRIES`, `ComplianceRule` rows (per-country feature, KYC, min age), `REQUIRE_KYC_FOR_WITHDRAWAL`, and global feature flags (`deposits_enabled`, `withdrawals_enabled`, `crypto_rewards_enabled`, `purchases_enabled`, `play_enabled`).

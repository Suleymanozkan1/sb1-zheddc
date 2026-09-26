# Future smart-contract architecture

The MVP intentionally has **no custom on-chain program**: deposits and withdrawals are standard SPL token
transfers, verified off-chain. The code is prepared for Anchor programs:

| Stage | Program | Integration point |
|---|---|---|
| Escrowed deposits | Anchor program owning a PDA vault per season | `buildDepositTransaction` → program instruction; `verifyDepositTransaction` reads program events |
| On-chain reward claims | Season Merkle root of `(user, amount)` from the `Reward` table; users claim with a proof | New `ClaimKind.SEASON` claims; `blockchain-service` publishes roots |
| NFT items | Metaplex Token Metadata (review the Metaplex NFT license) for LEGENDARY/MYTHIC items | `InventoryItem.sourceRef` ↔ mint address; ownership sync job |
| Marketplace | Anchor escrow for peer-to-peer item trades | Economy package gains `TRADE` journals |

Keep the `SolanaGateway` / `TreasurySigner` interfaces as the boundary so the game server and API stay
unaware of the on-chain implementation.

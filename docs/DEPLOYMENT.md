# Deployment

1. **Database**: provision managed PostgreSQL 16 (SSL). Run `pnpm db:deploy` and `pnpm db:seed` from CI.
2. **Secrets**: store `.env.production.example` values in a secret manager. Only blockchain-service gets `TREASURY_SECRET`.
3. **Images**: `docker build -f docker/node.Dockerfile --build-arg APP=api .` (also `game-server`, `blockchain-service`).
4. **API**: 2+ replicas behind a TLS load balancer; `TRUST_PROXY_HOPS=1`; health `/health`, readiness `/ready`.
5. **Game server**: WebSocket-capable load balancer with sticky sessions; one process per core; expose `wss://`.
6. **Blockchain service**: 1+ replicas (safe with `SKIP LOCKED`), private network only; `BLOCKCHAIN_SERVICE_HOST=0.0.0.0` inside the private network.
7. **Frontends**: build `apps/web` and `apps/admin` (Vercel/Cloudflare Pages). Proxy `/api/*` to the API on the same site; set `VITE_GAME_URL`.
8. **Observability**: Prometheus scraping `/metrics` on each service; ship JSON logs (pino) to your log stack.
9. **Before mainnet**: legal review (gaming/gambling/money-transmission rules per region), KYC/AML provider integration, KMS/HSM signer, penetration test, treasury reconciliation job.

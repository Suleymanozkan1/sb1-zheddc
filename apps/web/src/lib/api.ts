// Typed REST client. Cookies carry the session (HttpOnly); the CSRF token is read from its
// companion cookie and echoed in a header on every state-changing request.
import type {
  CharacterDto,
  InventoryItemDto,
  LeaderboardDto,
  LedgerEntryDto,
  MeDto,
  QuestDto,
  ShopProductDto,
  WalletInfoDto,
  BalancesDto,
  MatchMode,
  StatKey,
  WithdrawalDto,
  DepositDto,
  LeaderboardScope,
} from "@cryptoarena/shared";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function csrfToken(): string {
  return /(?:^|;\s*)ca_csrf=([^;]+)/.exec(document.cookie)?.[1] ?? "";
}

let refreshing: Promise<boolean> | null = null;

/** Resolves true once the CSRF cookie differs from `before` (the winning tab's rotation landed). */
async function cookiesRotated(before: string, timeoutMs = 3_000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 100) {
    if (csrfToken() !== before) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return csrfToken() !== before;
}

async function refreshSession(): Promise<boolean> {
  const before = csrfToken();
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" })
    // 409: another tab won the refresh race. Retry only once its rotated cookies have arrived.
    .then((r) => (r.ok ? true : r.status === 409 ? cookiesRotated(before) : false))
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: method === "POST" ? { "content-type": "application/json", "x-csrf-token": csrfToken() } : {},
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) return request<T>(method, path, body, false);
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export const newKey = (): string => crypto.randomUUID().replace(/-/g, "");

export const api = {
  me: () => request<MeDto>("GET", "/api/me"),
  profile: () => request<MeDto & { stats: Record<string, number> }>("GET", "/api/profile"),
  nonce: (address: string, purpose: "LOGIN" | "LINK_WALLET") => request<{ nonce: string; message: string }>("POST", "/api/auth/nonce", { address, purpose }),
  verify: (address: string, nonce: string, signature: string) => request<MeDto>("POST", "/api/auth/verify", { address, nonce, signature }),
  guest: () => request<MeDto>("POST", "/api/auth/guest"),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),
  linkWallet: (address: string, nonce: string, signature: string) => request<MeDto>("POST", "/api/wallet/connect", { address, nonce, signature }),

  characters: () => request<CharacterDto[]>("GET", "/api/characters"),
  unlockCharacter: (characterKey: string, sku?: string) =>
    request<{ characters: CharacterDto[]; balances: BalancesDto }>("POST", "/api/characters/unlock", { characterKey, sku, idempotencyKey: newKey() }),
  upgradeCharacter: (userCharacterId: string, stat: StatKey) =>
    request<{ characters: CharacterDto[]; balances: BalancesDto }>("POST", "/api/characters/upgrade", { userCharacterId, stat, idempotencyKey: newKey() }),

  inventory: () => request<{ slots: number; items: InventoryItemDto[] }>("GET", "/api/inventory"),
  equip: (inventoryItemId: string) => request<InventoryItemDto>("POST", "/api/inventory/equip", { inventoryItemId }),
  unequip: (inventoryItemId: string) => request<InventoryItemDto>("POST", "/api/inventory/unequip", { inventoryItemId }),
  upgradeItem: (inventoryItemId: string) => request<{ item: InventoryItemDto; balances: BalancesDto }>("POST", "/api/inventory/upgrade", { inventoryItemId, idempotencyKey: newKey() }),

  shop: () => request<ShopProductDto[]>("GET", "/api/shop"),
  purchase: (sku: string, quantity = 1) => request<{ purchaseId: string; balances: BalancesDto }>("POST", "/api/shop/purchase", { sku, quantity, idempotencyKey: newKey() }),

  leaderboard: (scope: LeaderboardScope) => request<LeaderboardDto>("GET", `/api/leaderboard?scope=${scope}`),
  quests: () => request<QuestDto[]>("GET", "/api/quests"),
  claimQuest: (questKey: string) => request<{ rewards: { status: string; amount: string; reason: string | null }[]; balances: BalancesDto }>("POST", "/api/quests/claim", { questKey }),

  wallet: () => request<WalletInfoDto>("GET", "/api/wallet"),
  ledger: () => request<LedgerEntryDto[]>("GET", "/api/wallet/ledger"),
  prepareDeposit: (amount: string) =>
    request<{ depositId: string; transaction: string | null; reference: string; amount: string; wallet: string; expiresAt: string; mock: boolean }>("POST", "/api/wallet/deposit/prepare", { amount }),
  mockSendDeposit: (depositId: string) => request<{ signature: string }>("POST", "/api/wallet/deposit/mock-send", { depositId }),
  verifyDeposit: (depositId: string, signature: string) => request<{ status: string; reason: string | null; deposit: DepositDto }>("POST", "/api/wallet/deposit/verify", { depositId, signature }),
  withdraw: (amount: string, walletAddress: string, idempotencyKey: string) => request<{ withdrawal: WithdrawalDto }>("POST", "/api/wallet/withdraw", { amount, walletAddress, idempotencyKey }),
  cancelWithdrawal: (withdrawalId: string) => request<{ withdrawal: WithdrawalDto }>("POST", "/api/wallet/withdraw/cancel", { withdrawalId }),

  gameTicket: (userCharacterId: string, mode: MatchMode) => request<{ ticket: string }>("POST", "/api/game/ticket", { userCharacterId, mode }),
};

// Typed REST client for the admin API. Cookies carry the session (HttpOnly); the CSRF token is
// read from its companion cookie and echoed in a header on every state-changing request.
import type { AdminRole, MeDto } from "@cryptoarena/shared";
import type {
  AdjustAccount,
  AdminUserRow,
  AntiCheatRow,
  AuditRow,
  CharacterRow,
  DepositRow,
  ItemRow,
  LeaderboardRow,
  LedgerRow,
  ListParams,
  Overview,
  ProductRow,
  PurchaseRow,
  RewardRow,
  RoomRow,
  SeasonRow,
  UserDetail,
  UserListRow,
  UserStatus,
  WalletRow,
  WithdrawalRow,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = Array.isArray(err.details)
      ? (err.details as { path?: string; message?: string }[])
          .map((d) => (d.path ? `${d.path}: ${d.message ?? ""}` : (d.message ?? "")))
          .filter(Boolean)
      : [];
    return issues.length ? `${err.message} — ${issues.join("; ")}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function csrfToken(): string {
  return /(?:^|;\s*)ca_csrf=([^;]+)/.exec(document.cookie)?.[1] ?? "";
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
    // 409: another tab refreshed first; the shared cookies are already rotated, so retry.
    .then((r) => r.ok || r.status === 409)
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
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as T;
}

/** Idempotency key: 32 hex chars (UUID without dashes). */
export const newKey = (): string => crypto.randomUUID().replace(/-/g, "");

function qs(p: ListParams): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.status) u.set("status", p.status);
  if (p.limit !== undefined) u.set("limit", String(p.limit));
  if (p.offset !== undefined) u.set("offset", String(p.offset));
  const s = u.toString();
  return s ? `?${s}` : "";
}

const list = <T>(path: string) => (p: ListParams = {}) => request<T>("GET", `${path}${qs(p)}`);

export const api = {
  // Auth
  me: () => request<MeDto>("GET", "/api/me"),
  nonce: (address: string) => request<{ nonce: string; message: string }>("POST", "/api/auth/nonce", { address, purpose: "LOGIN" }),
  verify: (address: string, nonce: string, signature: string) => request<MeDto>("POST", "/api/auth/verify", { address, nonce, signature }),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),

  // Reads
  overview: () => request<Overview>("GET", "/api/admin/overview"),
  users: list<{ total: number; rows: UserListRow[] }>("/api/admin/users"),
  user: (id: string) => request<UserDetail>("GET", `/api/admin/users/${encodeURIComponent(id)}`),
  wallets: list<WalletRow[]>("/api/admin/wallets"),
  deposits: list<DepositRow[]>("/api/admin/deposits"),
  withdrawals: list<WithdrawalRow[]>("/api/admin/withdrawals"),
  rewards: list<RewardRow[]>("/api/admin/rewards"),
  items: list<ItemRow[]>("/api/admin/items"),
  characters: list<CharacterRow[]>("/api/admin/characters"),
  shop: list<ProductRow[]>("/api/admin/shop"),
  purchases: list<PurchaseRow[]>("/api/admin/purchases"),
  seasons: list<SeasonRow[]>("/api/admin/seasons"),
  leaderboards: list<LeaderboardRow[]>("/api/admin/leaderboards"),
  rooms: list<RoomRow[]>("/api/admin/rooms"),
  transactions: list<LedgerRow[]>("/api/admin/transactions"),
  audit: list<AuditRow[]>("/api/admin/audit"),
  anticheat: list<AntiCheatRow[]>("/api/admin/anticheat"),

  // Actions
  setUserStatus: (userId: string, status: UserStatus, reason: string) => request<unknown>("POST", "/api/admin/users/status", { userId, status, reason }),
  setWithdrawalsSuspended: (userId: string, suspended: boolean, reason: string) =>
    request<unknown>("POST", "/api/admin/users/withdrawals", { userId, suspended, reason }),
  approveWithdrawal: (withdrawalId: string, reason: string) => request<unknown>("POST", "/api/admin/withdrawals/approve", { withdrawalId, reason }),
  cancelWithdrawal: (withdrawalId: string, reason: string) => request<unknown>("POST", "/api/admin/withdrawals/cancel", { withdrawalId, reason }),
  refundPurchase: (purchaseId: string, reason: string) => request<unknown>("POST", "/api/admin/purchases/refund", { purchaseId, reason }),
  grantItem: (userId: string, itemKey: string, quantity: number, reason: string) =>
    request<unknown>("POST", "/api/admin/items/grant", { userId, itemKey, quantity, reason, requestId: newKey() }),
  adjustBalance: (userId: string, account: AdjustAccount, delta: string, reason: string) =>
    request<unknown>("POST", "/api/admin/balance/adjust", { userId, account, delta, reason, requestId: newKey() }),
  fundPool: (amount: string, reason: string) => request<{ ok: boolean }>("POST", "/api/admin/pool/fund", { amount, reason, requestId: newKey() }),
  updateProduct: (body: { sku: string; price?: string; active?: boolean; name?: string; description?: string; reason: string }) =>
    request<ProductRow>("POST", "/api/admin/shop/product", body),
  setRole: (userId: string, role: AdminRole | null, reason: string) => request<AdminUserRow | null>("POST", "/api/admin/roles", { userId, role, reason }),
  distributeLeaderboard: (key: string, totalReward: string, reason: string) =>
    request<{ paid: number }>("POST", "/api/admin/leaderboards/distribute", { key, totalReward, reason }),
  startSeason: (body: { key: string; name: string; days: number; rewardPool: string; dailyRewardBudget: string; multiplierBps: number; reason: string }) =>
    request<SeasonRow>("POST", "/api/admin/seasons", body),
};

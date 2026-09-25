// One confirmation modal per admin mutation. Each receives its target (or null = closed).
import { AdminRole, parseUnits, type Asset } from "@cryptoarena/shared";
import { formatInt } from "@cryptoarena/ui";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { useSession } from "../lib/session";
import type { AdjustAccount, LeaderboardRow, ProductRow, UserStatus } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { ActionModal, Field, StatusBadge } from "./common";

interface Closeable {
  onClose: () => void;
  onDone?: () => void;
}

const DECIMAL_RE = /^\d{1,12}(\.\d{1,12})?$/;

/** Validates a human decimal token amount (server: `decimalAmount`) against token decimals. */
function checkDecimal(v: string, decimals: number, allowZero = false): string | null {
  const s = v.trim();
  if (!DECIMAL_RE.test(s)) return "Enter a decimal amount, e.g. 12.5";
  try {
    const u = parseUnits(s, decimals);
    if (!allowZero && u <= 0n) return "Amount must be greater than zero";
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

// ── Users ──

const STATUS_COPY: Record<UserStatus, { title: string; label: string; variant: "danger" | "primary" | "success"; text: string }> = {
  BANNED: { title: "Ban user", label: "Ban", variant: "danger", text: "Banned users cannot sign in and their sessions stop working." },
  SUSPENDED: { title: "Suspend user", label: "Suspend", variant: "danger", text: "Suspended users are restricted from gameplay and economy actions." },
  ACTIVE: { title: "Reactivate user", label: "Reactivate", variant: "success", text: "Restores full account access." },
};

export function UserStatusModal({ target, ...p }: Closeable & { target: { id: string; username: string; status: UserStatus; next: UserStatus } | null }) {
  const copy = STATUS_COPY[target?.next ?? "ACTIVE"];
  return (
    <ActionModal
      open={!!target}
      onClose={p.onClose}
      onDone={p.onDone}
      title={copy.title}
      confirmLabel={copy.label}
      variant={copy.variant}
      min="MODERATOR"
      description={
        target && (
          <>
            <p>
              <b className="text-white">{target.username}</b>: <StatusBadge status={target.status} /> → <StatusBadge status={target.next} />
            </p>
            <p className="mt-1 text-slate-400">{copy.text}</p>
          </>
        )
      }
      onConfirm={(reason) => (target ? api.setUserStatus(target.id, target.next, reason) : Promise.resolve())}
    />
  );
}

export function WithdrawalsSuspendModal({ target, ...p }: Closeable & { target: { id: string; username: string; suspended: boolean } | null }) {
  const next = !target?.suspended;
  return (
    <ActionModal
      open={!!target}
      onClose={p.onClose}
      onDone={p.onDone}
      title={next ? "Suspend withdrawals" : "Resume withdrawals"}
      confirmLabel={next ? "Suspend withdrawals" : "Resume withdrawals"}
      variant={next ? "danger" : "success"}
      min="MODERATOR"
      description={target && <p>{next ? `Block ${target.username} from requesting new withdrawals.` : `Allow ${target.username} to request withdrawals again.`}</p>}
      onConfirm={(reason) => (target ? api.setWithdrawalsSuspended(target.id, next, reason) : Promise.resolve())}
    />
  );
}

export function SetRoleModal(props: Closeable & { target: { id: string; username: string; role: AdminRole | null } | null }) {
  // Mounted only while open so every opening starts with a fresh form.
  return props.target ? <SetRoleBody {...props} target={props.target} /> : null;
}

function SetRoleBody({ target, ...p }: Closeable & { target: { id: string; username: string; role: AdminRole | null } }) {
  const { me } = useSession();
  const [role, setRole] = useState<AdminRole | "">(target.role ?? "");
  const self = target.id === me.id;
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Set admin role"
      confirmLabel={role ? `Set ${role}` : "Revoke admin access"}
      variant={role ? "primary" : "danger"}
      min="SUPER_ADMIN"
      validate={() => (self ? "You cannot change your own role" : (role || null) === (target.role ?? null) ? "Pick a different role" : null)}
      description={target && <p>Current role of <b className="text-white">{target.username}</b>: {target.role ?? "none"}</p>}
      onConfirm={(reason) => api.setRole(target.id, role || null, reason)}
    >
      <Field label="Role">
        <select className="field" value={role} onChange={(e) => setRole(e.target.value as AdminRole | "")}>
          <option value="">None (revoke)</option>
          {AdminRole.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>
    </ActionModal>
  );
}

export function GrantItemModal(props: Closeable & { target: { id: string; username: string } | null }) {
  // Mounted only while open so every opening starts with a fresh form.
  return props.target ? <GrantItemBody {...props} target={props.target} /> : null;
}

function GrantItemBody({ target, ...p }: Closeable & { target: { id: string; username: string } }) {
  const items = useAsync(api.items, "items");
  const [filter, setFilter] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [qty, setQty] = useState("1");
  const options = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (items.data ?? []).filter((i) => !f || i.key.includes(f) || i.name.toLowerCase().includes(f));
  }, [items.data, filter]);
  const selected = items.data?.find((i) => i.key === itemKey);
  const n = Number(qty);
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Grant item"
      confirmLabel="Grant"
      min="ADMIN"
      validate={() => (!itemKey ? "Pick an item" : !Number.isInteger(n) || n < 1 || n > 100 ? "Quantity must be 1–100" : null)}
      description={target && <p>Grant an item to <b className="text-white">{target.username}</b>. A fresh idempotency key is generated per request.</p>}
      onConfirm={(reason) => api.grantItem(target.id, itemKey, n, reason)}
    >
      <Field label="Item" hint={items.error ?? (selected ? `${selected.type} · ${selected.rarity}${selected.stackable ? ` · stack ≤ ${selected.maxStack}` : ""}` : `${options.length} items`)}>
        <input className="field mb-2" type="search" placeholder="Filter by key or name…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="field" value={itemKey} onChange={(e) => setItemKey(e.target.value)} size={Math.min(8, Math.max(3, options.length))}>
          {items.loading && <option disabled>Loading…</option>}
          {options.map((i) => (
            <option key={i.key} value={i.key}>
              {i.name} — {i.key} ({i.rarity.toLowerCase()} {i.type.toLowerCase()}){i.active ? "" : " [inactive]"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantity">
        <input className="field" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

const ACCOUNT_LABEL: Record<AdjustAccount, string> = { GOLD: "Gold", GEMS: "Gems", CRYPTO_REWARD: "Crypto reward balance" };

export function AdjustBalanceModal(props: Closeable & { target: { id: string; username: string; balances?: Record<AdjustAccount, string> } | null }) {
  // Mounted only while open so every opening starts with a fresh form.
  return props.target ? <AdjustBalanceBody {...props} target={props.target} /> : null;
}

function AdjustBalanceBody({ target, ...p }: Closeable & { target: { id: string; username: string; balances?: Record<AdjustAccount, string> } }) {
  const { token } = useSession();
  const [account, setAccount] = useState<AdjustAccount>("GOLD");
  const [delta, setDelta] = useState("");
  const valid = /^-?\d{1,20}$/.test(delta.trim()) && BigInt(delta.trim() || "0") !== 0n;
  const current = target.balances?.[account];
  const after = valid && current !== undefined ? (BigInt(current) + BigInt(delta.trim())).toString() : null;
  const asAsset = account === "CRYPTO_REWARD" ? "CRYPTO" : account;
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Adjust balance"
      confirmLabel="Post adjustment"
      variant="danger"
      min="ADMIN"
      validate={() => (!valid ? "Delta must be a non-zero signed integer in base units" : null)}
      description={target && <p>Posts an ADMIN_ADJUSTMENT journal for <b className="text-white">{target.username}</b>. Ledger rows are never edited.</p>}
      onConfirm={(reason) => api.adjustBalance(target.id, account, delta.trim(), reason)}
    >
      <Field label="Account">
        <select className="field" value={account} onChange={(e) => setAccount(e.target.value as AdjustAccount)}>
          {(Object.keys(ACCOUNT_LABEL) as AdjustAccount[]).map((a) => (
            <option key={a} value={a}>
              {ACCOUNT_LABEL[a]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Delta (signed, base units)"
        hint={
          <>
            {account === "CRYPTO_REWARD" ? `${token.decimals} decimals: 1 ${token.symbol} = 1${"0".repeat(token.decimals)} base units. ` : ""}
            {valid && <>Change: {delta.trim().startsWith("-") ? "−" : "+"}{money(delta.trim().replace("-", ""), asAsset, token)}. </>}
            {current !== undefined && <>Current: {money(current, asAsset, token)}{after !== null && <> → {money(after.startsWith("-") ? "0" : after, asAsset, token)}{after.startsWith("-") && " (would go negative)"}</>}</>}
          </>
        }
      >
        <input className="field font-mono" inputMode="numeric" placeholder="e.g. 500 or -500" value={delta} onChange={(e) => setDelta(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

// ── Withdrawals & purchases ──

export function WithdrawalActionModal({
  target,
  ...p
}: Closeable & { target: { kind: "approve" | "cancel"; id: string; username?: string; amount: string; fee: string; walletAddress: string } | null }) {
  const { token } = useSession();
  const approve = target?.kind === "approve";
  return (
    <ActionModal
      open={!!target}
      onClose={p.onClose}
      onDone={p.onDone}
      title={approve ? "Approve withdrawal" : "Cancel withdrawal"}
      confirmLabel={approve ? "Approve & release" : "Cancel & refund"}
      variant={approve ? "success" : "danger"}
      min="ADMIN"
      description={
        target && (
          <div className="space-y-1">
            <p>
              {target.username && <b className="text-white">{target.username}: </b>}
              {money(target.amount, "CRYPTO", token)} (fee {money(target.fee, "CRYPTO", token)})
            </p>
            <p className="font-mono text-xs break-all text-slate-400">→ {target.walletAddress}</p>
            <p className="text-slate-400">{approve ? "Clears the review hold; the worker will broadcast it on-chain." : "Only PENDING withdrawals without a signature can be cancelled. Held funds are returned."}</p>
          </div>
        )
      }
      onConfirm={(reason) => (!target ? Promise.resolve() : approve ? api.approveWithdrawal(target.id, reason) : api.cancelWithdrawal(target.id, reason))}
    />
  );
}

export function RefundModal({ target, ...p }: Closeable & { target: { id: string; productName: string; totalPrice: string; currency: Asset; username?: string } | null }) {
  const { token } = useSession();
  return (
    <ActionModal
      open={!!target}
      onClose={p.onClose}
      onDone={p.onDone}
      title="Refund purchase"
      confirmLabel="Refund"
      variant="danger"
      min="ADMIN"
      description={
        target && (
          <p>
            Refund <b className="text-white">{target.productName}</b> ({money(target.totalPrice, target.currency, token)}){target.username ? ` to ${target.username}` : ""}. Posts a reversing journal.
          </p>
        )
      }
      onConfirm={(reason) => (target ? api.refundPurchase(target.id, reason) : Promise.resolve())}
    />
  );
}

// ── Economy ──

export function FundPoolModal({ open, ...p }: Closeable & { open: boolean }) {
  return open ? <FundPoolBody {...p} /> : null;
}

function FundPoolBody(p: Closeable) {
  const { token } = useSession();
  const [amount, setAmount] = useState("");
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Fund reward pool"
      confirmLabel="Fund pool"
      min="SUPER_ADMIN"
      validate={() => checkDecimal(amount, token.decimals)}
      description={<p>Moves issuance into the crypto reward pool (POOL_FUNDING journal).</p>}
      onConfirm={(reason) => api.fundPool(amount.trim(), reason)}
    >
      <Field label={`Amount (${token.symbol}, decimal)`} hint="Human-readable amount, converted to base units server-side.">
        <input className="field font-mono" inputMode="decimal" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

export function EditProductModal(props: Closeable & { target: ProductRow | null }) {
  // Mounted only while open so every opening starts with a fresh form.
  return props.target ? <EditProductBody {...props} target={props.target} /> : null;
}

function EditProductBody({ target, ...p }: Closeable & { target: ProductRow }) {
  const { token } = useSession();
  const [price, setPrice] = useState(target.price);
  const [active, setActive] = useState(target.active);
  const [name, setName] = useState(target.name);
  const [description, setDescription] = useState(target.description);
  const changes = target
    ? {
        ...(price.trim() !== target.price ? { price: price.trim() } : {}),
        ...(active !== target.active ? { active } : {}),
        ...(name.trim() !== target.name ? { name: name.trim() } : {}),
        ...(description.trim() !== target.description ? { description: description.trim() } : {}),
      }
    : {};
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Edit shop product"
      confirmLabel="Save product"
      min="ADMIN"
      validate={() =>
        !/^\d{1,20}$/.test(price.trim())
          ? "Price must be a non-negative integer in base units"
          : !name.trim() || name.trim().length > 80
            ? "Name must be 1–80 characters"
            : description.trim().length > 500
              ? "Description must be ≤ 500 characters"
              : Object.keys(changes).length === 0
                ? "No changes"
                : null
      }
      description={target && <p className="font-mono text-xs text-slate-400">{target.sku} · {target.category} · {target.currency}</p>}
      onConfirm={(reason) => api.updateProduct({ sku: target.sku, ...changes, reason })}
    >
      <Field label={`Price (${target.currency ?? ""} base units)`} hint={/^\d{1,20}$/.test(price.trim()) && target ? `= ${money(price.trim(), target.currency, token)}` : undefined}>
        <input className="field font-mono" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Name">
        <input className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className="field min-h-16" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (visible in shop)
      </label>
    </ActionModal>
  );
}

export function DistributeModal(props: Closeable & { target: LeaderboardRow | null }) {
  // Mounted only while open so every opening starts with a fresh form.
  return props.target ? <DistributeBody {...props} target={props.target} /> : null;
}

function DistributeBody({ target, ...p }: Closeable & { target: LeaderboardRow }) {
  const { token } = useSession();
  const [amount, setAmount] = useState("");
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Distribute leaderboard rewards"
      confirmLabel="Distribute"
      variant="danger"
      min="SUPER_ADMIN"
      validate={() => checkDecimal(amount, token.decimals)}
      description={
        target && (
          <p>
            Pay out <b className="text-white">{target.key}</b> ({formatInt(target._count.entries)} entries) from the reward pool.
            {target.rewardsDistributedAt && <span className="text-amber-300"> Already distributed at {new Date(target.rewardsDistributedAt).toLocaleString()}.</span>}
          </p>
        )
      }
      onConfirm={(reason) => api.distributeLeaderboard(target.key, amount.trim(), reason)}
    >
      <Field label={`Total reward (${token.symbol}, decimal)`}>
        <input className="field font-mono" inputMode="decimal" placeholder="500" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

export function StartSeasonModal({ open, ...p }: Closeable & { open: boolean }) {
  return open ? <StartSeasonBody {...p} /> : null;
}

function StartSeasonBody(p: Closeable) {
  const { token } = useSession();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [pool, setPool] = useState("");
  const [daily, setDaily] = useState("");
  const [mult, setMult] = useState("10000");
  const d = Number(days);
  const m = Number(mult);
  return (
    <ActionModal
      open
      onClose={p.onClose}
      onDone={p.onDone}
      title="Start new season"
      confirmLabel="Start season"
      variant="danger"
      min="SUPER_ADMIN"
      validate={() =>
        !/^[A-Za-z0-9_-]{2,20}$/.test(key.trim())
          ? "Key: 2–20 chars, letters, digits, _ or -"
          : name.trim().length < 2 || name.trim().length > 80
            ? "Name: 2–80 characters"
            : !Number.isInteger(d) || d < 1 || d > 365
              ? "Days: 1–365"
              : !Number.isInteger(m) || m < 0 || m > 30000
                ? "Multiplier: 0–30000 bps"
                : (checkDecimal(pool, token.decimals, true) ?? checkDecimal(daily, token.decimals, true))
      }
      description={<p className="text-amber-200">Ends the currently ACTIVE season immediately and funds the new season's reward pool.</p>}
      onConfirm={(reason) => api.startSeason({ key: key.trim(), name: name.trim(), days: d, rewardPool: pool.trim(), dailyRewardBudget: daily.trim(), multiplierBps: m, reason })}
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Field label="Key">
          <input className="field font-mono" placeholder="S2" value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Field label="Name">
          <input className="field" placeholder="Season 2: Neon Rising" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Duration (days)">
          <input className="field" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Multiplier (bps)" hint={`${(m / 10000).toFixed(2)}×`}>
          <input className="field" type="number" min={0} max={30000} step={100} value={mult} onChange={(e) => setMult(e.target.value)} />
        </Field>
        <Field label={`Reward pool (${token.symbol})`}>
          <input className="field font-mono" inputMode="decimal" placeholder="100000" value={pool} onChange={(e) => setPool(e.target.value)} />
        </Field>
        <Field label={`Daily budget (${token.symbol})`}>
          <input className="field font-mono" inputMode="decimal" placeholder="3000" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
      </div>
    </ActionModal>
  );
}

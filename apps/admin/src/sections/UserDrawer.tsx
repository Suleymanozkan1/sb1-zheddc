// User detail drawer: GET /api/admin/users/:id with every per-user admin action.
import { Panel, RarityBadge, Table, cx } from "@cryptoarena/ui";
import { useEffect, useState, type ReactNode } from "react";
import {
  AdjustBalanceModal,
  GrantItemModal,
  RefundModal,
  SetRoleModal,
  UserStatusModal,
  WithdrawalActionModal,
  WithdrawalsSuspendModal,
} from "../components/actions";
import { Addr, Badge, ErrorBox, JsonCell, Loading, Mono, RoleButton, StatusBadge } from "../components/common";
import { api } from "../lib/api";
import { dt, money } from "../lib/format";
import { ROLE_COLOR } from "../lib/roles";
import { useSession } from "../lib/session";
import type { PurchaseBase, UserDetail, UserStatus, WithdrawalBase } from "../lib/types";
import { useAsync } from "../lib/useAsync";

type Tab = "overview" | "characters" | "inventory" | "purchases" | "withdrawals" | "deposits" | "flags";

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 text-sm">
      <span className="text-slate-400">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { token, me } = useSession();
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync(() => api.user(userId), `${userId}#${refresh}`);
  const [tab, setTab] = useState<Tab>("overview");
  const [statusTarget, setStatusTarget] = useState<UserStatus | null>(null);
  const [wdOpen, setWdOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [refund, setRefund] = useState<PurchaseBase | null>(null);
  const [wdAction, setWdAction] = useState<{ kind: "approve" | "cancel"; w: WithdrawalBase } | null>(null);
  const done = () => setRefresh((n) => n + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let open modals handle Escape first.
      if (e.key === "Escape" && !document.querySelector("[aria-modal='true']")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const u = data?.user;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "characters", label: "Characters", n: u?.characters.length },
    { id: "inventory", label: "Inventory", n: u?.inventory.length },
    { id: "purchases", label: "Purchases", n: u?.purchases.length },
    { id: "withdrawals", label: "Withdrawals", n: u?.withdrawals.length },
    { id: "deposits", label: "Deposits", n: u?.deposits.length },
    { id: "flags", label: "Anti-cheat", n: u?.antiCheatFlags.length },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="h-full w-full max-w-4xl overflow-y-auto border-l border-cyan-400/20 bg-[#070918]/95 p-4 shadow-[0_0_60px_rgb(34_211_238/0.15)] backdrop-blur-xl md:p-6"
        onClick={(e) => e.stopPropagation()}
        aria-label="User details"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">User</p>
            <h2 className="font-display neon-text truncate text-xl font-bold text-cyan-100 md:text-2xl">{u?.username ?? "…"}</h2>
            <p className="font-mono text-[11px] break-all text-slate-500">{userId}</p>
          </div>
          <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading && !data && <Loading />}
        {error && <ErrorBox>{error}</ErrorBox>}

        {u && data && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusBadge status={u.status} />
              {u.withdrawalsSuspended && <Badge tone="red">withdrawals suspended</Badge>}
              {u.isGuest && <Badge>guest</Badge>}
              {u.admin?.active && (
                <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: ROLE_COLOR[u.admin.role], borderColor: `${ROLE_COLOR[u.admin.role]}66` }}>
                  {u.admin.role}
                </span>
              )}
              <Badge tone={u.riskScore >= 50 ? "red" : "slate"}>risk {u.riskScore}</Badge>
              {u.id === me.id && <Badge tone="cyan">you</Badge>}
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <RoleButton size="sm" variant="danger" min="MODERATOR" disabled={u.status === "BANNED"} onClick={() => setStatusTarget("BANNED")}>
                Ban
              </RoleButton>
              <RoleButton size="sm" variant="danger" min="MODERATOR" disabled={u.status === "SUSPENDED"} onClick={() => setStatusTarget("SUSPENDED")}>
                Suspend
              </RoleButton>
              <RoleButton size="sm" variant="success" min="MODERATOR" disabled={u.status === "ACTIVE"} onClick={() => setStatusTarget("ACTIVE")}>
                Reactivate
              </RoleButton>
              <RoleButton size="sm" min="MODERATOR" onClick={() => setWdOpen(true)}>
                {u.withdrawalsSuspended ? "Resume withdrawals" : "Suspend withdrawals"}
              </RoleButton>
              <RoleButton size="sm" min="ADMIN" onClick={() => setGrantOpen(true)}>
                Grant item
              </RoleButton>
              <RoleButton size="sm" min="ADMIN" onClick={() => setAdjustOpen(true)}>
                Adjust balance
              </RoleButton>
              <RoleButton size="sm" min="SUPER_ADMIN" disabled={u.id === me.id} title={u.id === me.id ? "You cannot change your own role" : undefined} onClick={() => setRoleOpen(true)}>
                Set role
              </RoleButton>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {(
                [
                  ["Gold", money(data.balances.gold, "GOLD", token)],
                  ["Gems", money(data.balances.gems, "GEMS", token)],
                  ["Crypto spendable", money(data.balances.cryptoSpendable, "CRYPTO", token)],
                  ["Crypto reward", money(data.balances.cryptoReward, "CRYPTO", token)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="glass px-3 py-2">
                  <div className="text-[10px] tracking-widest text-slate-400 uppercase">{k}</div>
                  <div className="font-display text-sm font-bold break-all text-cyan-100">{v}</div>
                </div>
              ))}
            </div>

            <nav className="mb-3 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "shrink-0 rounded-t-lg px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap uppercase",
                    tab === t.id ? "border-b-2 border-cyan-400 text-cyan-200" : "text-slate-400 hover:text-white",
                  )}
                >
                  {t.label}
                  {t.n !== undefined && <span className="ml-1 text-slate-500">{t.n}</span>}
                </button>
              ))}
            </nav>

            <DetailTab tab={tab} data={data} onRefund={setRefund} onWithdrawal={(kind, w) => setWdAction({ kind, w })} />
          </>
        )}

        {u && (
          <>
            <UserStatusModal target={statusTarget && { id: u.id, username: u.username, status: u.status, next: statusTarget }} onClose={() => setStatusTarget(null)} onDone={done} />
            <WithdrawalsSuspendModal target={wdOpen ? { id: u.id, username: u.username, suspended: u.withdrawalsSuspended } : null} onClose={() => setWdOpen(false)} onDone={done} />
            <SetRoleModal target={roleOpen ? { id: u.id, username: u.username, role: u.admin?.active ? u.admin.role : null } : null} onClose={() => setRoleOpen(false)} onDone={done} />
            <GrantItemModal target={grantOpen ? { id: u.id, username: u.username } : null} onClose={() => setGrantOpen(false)} onDone={done} />
            <AdjustBalanceModal
              target={adjustOpen && data ? { id: u.id, username: u.username, balances: { GOLD: data.balances.gold, GEMS: data.balances.gems, CRYPTO_REWARD: data.balances.cryptoReward } } : null}
              onClose={() => setAdjustOpen(false)}
              onDone={done}
            />
            <RefundModal
              target={refund && { id: refund.id, productName: refund.product.name, totalPrice: refund.totalPrice, currency: refund.currency, username: u.username }}
              onClose={() => setRefund(null)}
              onDone={done}
            />
            <WithdrawalActionModal
              target={wdAction && { kind: wdAction.kind, id: wdAction.w.id, username: u.username, amount: wdAction.w.amount, fee: wdAction.w.fee, walletAddress: wdAction.w.walletAddress }}
              onClose={() => setWdAction(null)}
              onDone={done}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function DetailTab({
  tab,
  data,
  onRefund,
  onWithdrawal,
}: {
  tab: Tab;
  data: UserDetail;
  onRefund: (p: PurchaseBase) => void;
  onWithdrawal: (kind: "approve" | "cancel", w: WithdrawalBase) => void;
}) {
  const { token } = useSession();
  const u = data.user;
  switch (tab) {
    case "overview":
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Account">
            <KV k="Status">
              <StatusBadge status={u.status} />
            </KV>
            {u.banReason && <KV k="Ban reason">{u.banReason}</KV>}
            <KV k="Premium">
              {u.premiumTier}
              {u.premiumUntil ? ` until ${dt(u.premiumUntil)}` : ""}
            </KV>
            <KV k="KYC">{u.kycStatus}</KV>
            <KV k="Age verified">{u.ageVerified ? "yes" : "no"}</KV>
            <KV k="Country">{u.countryCode ?? "—"}</KV>
            <KV k="Inventory slots">{u.inventorySlots}</KV>
            <KV k="Last login">{dt(u.lastLoginAt)}</KV>
            <KV k="Created">{dt(u.createdAt)}</KV>
            <KV k="Admin">{u.admin ? `${u.admin.role}${u.admin.active ? "" : " (inactive)"}` : "—"}</KV>
          </Panel>
          <Panel title="Wallets">
            <Table
              columns={["Address", "Primary", "Verified"]}
              rows={u.wallets.map((w) => [<Addr value={w.address} />, w.isPrimary ? <Badge tone="cyan">primary</Badge> : "—", dt(w.verifiedAt)])}
              empty="No linked wallets"
            />
          </Panel>
        </div>
      );
    case "characters":
      return (
        <Table
          columns={["Character", "Class", "Rarity", "Level", "XP", "Stat points", "Unlocked"]}
          rows={u.characters.map((c) => [c.character.name, c.character.class, <RarityBadge rarity={c.character.rarity} />, c.level, c.xp, c.statPoints, dt(c.createdAt)])}
          empty="No characters"
        />
      );
    case "inventory":
      return (
        <Table
          columns={["Item", "Type", "Rarity", "Qty", "Upgrade", "Equipped", "Source", "Acquired"]}
          rows={u.inventory.map((i) => [
            <span>
              {i.item.name} <span className="font-mono text-[10px] text-slate-500">{i.item.key}</span>
            </span>,
            i.item.type,
            <RarityBadge rarity={i.item.rarity} />,
            i.quantity,
            `+${i.upgradeLevel}`,
            i.equipped ? <Badge tone="lime">{i.equippedSlot ?? "yes"}</Badge> : "—",
            i.source,
            dt(i.acquiredAt),
          ])}
          empty="Inventory is empty"
        />
      );
    case "purchases":
      return (
        <Table
          columns={["Created", "Product", "Qty", "Total", "Status", ""]}
          rows={u.purchases.map((p) => [
            dt(p.createdAt),
            <span>
              {p.product.name} <span className="font-mono text-[10px] text-slate-500">{p.product.sku}</span>
            </span>,
            p.quantity,
            money(p.totalPrice, p.currency, token),
            <StatusBadge status={p.status} />,
            <RoleButton size="sm" variant="danger" min="ADMIN" disabled={p.status !== "COMPLETED"} onClick={() => onRefund(p)}>
              Refund
            </RoleButton>,
          ])}
          empty="No purchases"
        />
      );
    case "withdrawals":
      return (
        <Table
          columns={["Created", "Amount", "Fee", "Status", "To", "Signature", "Error", ""]}
          rows={u.withdrawals.map((w) => [
            dt(w.createdAt),
            money(w.amount, "CRYPTO", token),
            money(w.fee, "CRYPTO", token),
            <span className="flex flex-wrap gap-1">
              <StatusBadge status={w.status} />
              {w.requiresReview && <Badge tone="amber">review</Badge>}
            </span>,
            <Addr value={w.walletAddress} />,
            <Mono value={w.signature} />,
            w.lastError ?? "—",
            <span className="flex gap-1">
              <RoleButton size="sm" variant="success" min="ADMIN" disabled={!(w.status === "PENDING" && w.requiresReview)} onClick={() => onWithdrawal("approve", w)}>
                Approve
              </RoleButton>
              <RoleButton size="sm" variant="danger" min="ADMIN" disabled={w.status !== "PENDING" || !!w.signature} onClick={() => onWithdrawal("cancel", w)}>
                Cancel
              </RoleButton>
            </span>,
          ])}
          empty="No withdrawals"
        />
      );
    case "deposits":
      return (
        <Table
          columns={["Created", "Amount", "Status", "Signature", "Credited", "Failure"]}
          rows={u.deposits.map((d) => [dt(d.createdAt), money(d.amount, "CRYPTO", token), <StatusBadge status={d.status} />, <Mono value={d.signature} />, dt(d.creditedAt), d.failureReason ?? "—"])}
          empty="No deposits"
        />
      );
    case "flags":
      return (
        <Table
          columns={["Time", "Kind", "Severity", "Match", "Details"]}
          rows={u.antiCheatFlags.map((f) => [
            dt(f.createdAt),
            <span className="font-mono text-xs">{f.kind}</span>,
            <Badge tone={f.severity >= 3 ? "red" : f.severity >= 2 ? "amber" : "slate"}>sev {f.severity}</Badge>,
            <Mono value={f.matchId} />,
            <JsonCell value={f.details} />,
          ])}
          empty="No anti-cheat flags"
        />
      );
  }
}

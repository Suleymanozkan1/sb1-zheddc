// List sections. Each maps 1:1 to a GET /api/admin/* endpoint.
import { DepositStatus, WithdrawalStatus } from "@cryptoarena/shared";
import { RarityBadge, formatInt } from "@cryptoarena/ui";
import { useState } from "react";
import { DistributeModal, EditProductModal, RefundModal, StartSeasonModal, WithdrawalActionModal } from "../components/actions";
import { Addr, Badge, JsonCell, Mono, RoleButton, StatusBadge, UserLink } from "../components/common";
import { ListView } from "../components/ListView";
import { api } from "../lib/api";
import { dt, money } from "../lib/format";
import { useSession } from "../lib/session";
import type { LeaderboardRow, ProductRow, PurchaseRow, WithdrawalRow } from "../lib/types";

const has = (needle: string, ...hay: (string | null | undefined)[]) => hay.some((h) => h?.toLowerCase().includes(needle));
const CLIENT_FILTER = "Search filters the loaded page (endpoint has no server-side search).";

export function Wallets() {
  return (
    <ListView
      title="Wallets"
      fetch={api.wallets}
      paging="server"
      serverSearch
      searchPlaceholder="Wallet address contains…"
      columns={["Address", "User", "Chain", "Primary", "Verified", "Created"]}
      row={(w) => [<Addr value={w.address} />, <UserLink id={w.userId} name={w.user.username} />, w.chain, w.isPrimary ? <Badge tone="cyan">primary</Badge> : "—", dt(w.verifiedAt), dt(w.createdAt)]}
    />
  );
}

export function Deposits() {
  const { token } = useSession();
  return (
    <ListView
      title="Deposits"
      fetch={api.deposits}
      paging="server"
      statuses={DepositStatus}
      localSearch={(d, q) => has(q, d.user.username, d.id, d.signature, d.reference, d.userId)}
      searchPlaceholder="Filter by user, id, signature…"
      note={CLIENT_FILTER}
      columns={["Created", "User", "Amount", "Status", "Signature", "Network", "Credited", "Failure"]}
      row={(d) => [
        dt(d.createdAt),
        <UserLink id={d.userId} name={d.user.username} />,
        money(d.amount, "CRYPTO", token),
        <StatusBadge status={d.status} />,
        <Mono value={d.signature} />,
        d.network,
        dt(d.creditedAt),
        d.failureReason ?? "—",
      ]}
    />
  );
}

export function Withdrawals() {
  const { token } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [target, setTarget] = useState<{ kind: "approve" | "cancel"; w: WithdrawalRow } | null>(null);
  return (
    <>
      <ListView
        title="Withdrawals"
        fetch={api.withdrawals}
        paging="server"
        refreshKey={refresh}
        statuses={["REVIEW", ...WithdrawalStatus]}
        localSearch={(w, q) => has(q, w.user.username, w.id, w.walletAddress, w.signature, w.userId)}
        searchPlaceholder="Filter by user, address, id…"
        note="REVIEW = pending and flagged for manual review."
        columns={["Created", "User", "Risk", "Amount", "Fee", "Status", "To", "Signature", "Last error", "Actions"]}
        row={(w) => [
          dt(w.createdAt),
          <UserLink id={w.userId} name={w.user.username} />,
          <span className={w.user.riskScore >= 50 ? "font-bold text-rose-300" : undefined}>{w.user.riskScore}</span>,
          money(w.amount, "CRYPTO", token),
          money(w.fee, "CRYPTO", token),
          <span className="flex flex-wrap gap-1">
            <StatusBadge status={w.status} />
            {w.requiresReview && <Badge tone="amber">review</Badge>}
          </span>,
          <Addr value={w.walletAddress} />,
          <Mono value={w.signature} />,
          w.lastError ? <span className="text-xs text-rose-300">{w.lastError}</span> : "—",
          <span className="flex gap-1">
            <RoleButton size="sm" variant="success" min="ADMIN" disabled={!(w.status === "PENDING" && w.requiresReview)} onClick={() => setTarget({ kind: "approve", w })}>
              Approve
            </RoleButton>
            <RoleButton size="sm" variant="danger" min="ADMIN" disabled={w.status !== "PENDING" || !!w.signature} onClick={() => setTarget({ kind: "cancel", w })}>
              Cancel
            </RoleButton>
          </span>,
        ]}
      />
      <WithdrawalActionModal
        target={target && { kind: target.kind, id: target.w.id, username: target.w.user.username, amount: target.w.amount, fee: target.w.fee, walletAddress: target.w.walletAddress }}
        onClose={() => setTarget(null)}
        onDone={() => setRefresh((n) => n + 1)}
      />
    </>
  );
}

export function Rewards() {
  const { token } = useSession();
  return (
    <ListView
      title="Rewards"
      fetch={api.rewards}
      paging="server"
      statuses={["GRANTED", "CAPPED", "REJECTED"]}
      localSearch={(r, q) => has(q, r.user.username, r.source, r.reason, r.userId, r.matchId)}
      searchPlaceholder="Filter by user, source, reason…"
      note={CLIENT_FILTER}
      columns={["Created", "User", "Source", "Asset", "Base", "Final", "Multipliers (bps)", "Status", "Reason"]}
      row={(r) => [
        dt(r.createdAt),
        <UserLink id={r.userId} name={r.user.username} />,
        r.source,
        r.asset,
        money(r.baseAmount, r.asset, token),
        <b>{money(r.amount, r.asset, token)}</b>,
        <span className="font-mono text-xs">
          perf {r.performanceBps} · evt {r.eventBps} · season {r.seasonBps}
        </span>,
        <StatusBadge status={r.status} />,
        r.reason ?? "—",
      ]}
    />
  );
}

export function Items() {
  return (
    <ListView
      title="Items"
      fetch={api.items}
      paging="none"
      localSearch={(i, q) => has(q, i.key, i.name, i.type, i.rarity)}
      searchPlaceholder="Filter by key, name, type, rarity…"
      columns={["Key", "Name", "Type", "Rarity", "Stack", "Max upg.", "Lvl req.", "Drop wt.", "Active", "Stats"]}
      row={(i) => [
        <span className="font-mono text-xs">{i.key}</span>,
        i.name,
        i.type,
        <RarityBadge rarity={i.rarity} />,
        i.stackable ? `≤ ${i.maxStack}` : "—",
        i.maxUpgrade,
        i.levelRequirement,
        i.dropWeight,
        i.active ? <Badge tone="lime">yes</Badge> : <Badge>no</Badge>,
        <JsonCell value={i.stats} />,
      ]}
    />
  );
}

export function Characters() {
  return (
    <ListView
      title="Characters"
      fetch={api.characters}
      paging="none"
      localSearch={(c, q) => has(q, c.key, c.name, c.class, c.rarity)}
      columns={["Key", "Name", "Class", "Rarity", "HP", "DMG", "ARM", "SPD", "Owners", "Starter", "Active"]}
      row={(c) => [
        <span className="font-mono text-xs">{c.key}</span>,
        c.name,
        c.class,
        <RarityBadge rarity={c.rarity} />,
        c.stats?.baseHp ?? "—",
        c.stats?.baseDamage ?? "—",
        c.stats?.baseArmor ?? "—",
        c.stats?.baseSpeed ?? "—",
        formatInt(c._count.userCharacters),
        c.isStarter ? <Badge tone="cyan">starter</Badge> : "—",
        c.active ? <Badge tone="lime">yes</Badge> : <Badge>no</Badge>,
      ]}
    />
  );
}

export function Shop() {
  const { token } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<ProductRow | null>(null);
  return (
    <>
      <ListView
        title="Shop products"
        fetch={api.shop}
        paging="none"
        refreshKey={refresh}
        localSearch={(p, q) => has(q, p.sku, p.name, p.category)}
        searchPlaceholder="Filter by SKU, name, category…"
        columns={["SKU", "Name", "Category", "Rarity", "Price", "Limit", "Sold", "Active", "Grants", ""]}
        row={(p) => [
          <span className="font-mono text-xs">{p.sku}</span>,
          p.name,
          p.category,
          <RarityBadge rarity={p.rarity} />,
          <b>{money(p.price, p.currency, token)}</b>,
          p.perUserLimit ?? "∞",
          formatInt(p._count?.purchases ?? 0),
          p.active ? <Badge tone="lime">active</Badge> : <Badge>hidden</Badge>,
          <JsonCell value={p.metadata} />,
          <RoleButton size="sm" min="ADMIN" onClick={() => setEdit(p)}>
            Edit
          </RoleButton>,
        ]}
      />
      <EditProductModal target={edit} onClose={() => setEdit(null)} onDone={() => setRefresh((n) => n + 1)} />
    </>
  );
}

export function Purchases() {
  const { token } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [refund, setRefund] = useState<PurchaseRow | null>(null);
  return (
    <>
      <ListView
        title="Purchases"
        fetch={api.purchases}
        paging="server"
        refreshKey={refresh}
        localSearch={(p, q) => has(q, p.user.username, p.product.sku, p.product.name, p.id, p.userId)}
        searchPlaceholder="Filter by user, SKU, id…"
        note={CLIENT_FILTER}
        columns={["Created", "User", "Product", "Qty", "Total", "Status", "Refunded", ""]}
        row={(p) => [
          dt(p.createdAt),
          <UserLink id={p.userId} name={p.user.username} />,
          <span>
            {p.product.name} <span className="font-mono text-xs text-slate-500">{p.product.sku}</span>
          </span>,
          p.quantity,
          money(p.totalPrice, p.currency, token),
          <StatusBadge status={p.status} />,
          dt(p.refundedAt),
          <RoleButton size="sm" variant="danger" min="ADMIN" disabled={p.status !== "COMPLETED"} onClick={() => setRefund(p)}>
            Refund
          </RoleButton>,
        ]}
      />
      <RefundModal
        target={refund && { id: refund.id, productName: refund.product.name, totalPrice: refund.totalPrice, currency: refund.currency, username: refund.user.username }}
        onClose={() => setRefund(null)}
        onDone={() => setRefresh((n) => n + 1)}
      />
    </>
  );
}

export function Seasons() {
  const { token } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListView
        title="Seasons"
        fetch={api.seasons}
        paging="none"
        refreshKey={refresh}
        localSearch={(s, q) => has(q, s.key, s.name, s.status)}
        actions={
          <RoleButton size="sm" variant="primary" min="SUPER_ADMIN" onClick={() => setOpen(true)}>
            + New season
          </RoleButton>
        }
        columns={["Key", "Name", "Status", "Starts", "Ends", "Reward pool", "Daily budget", "Multiplier"]}
        row={(s) => [
          <span className="font-mono text-xs">{s.key}</span>,
          s.name,
          <StatusBadge status={s.status} />,
          dt(s.startsAt),
          dt(s.endsAt),
          money(s.rewardPool, "CRYPTO", token),
          money(s.dailyRewardBudget, "CRYPTO", token),
          `${(s.multiplierBps / 10000).toFixed(2)}×`,
        ]}
      />
      <StartSeasonModal open={open} onClose={() => setOpen(false)} onDone={() => setRefresh((n) => n + 1)} />
    </>
  );
}

export function Leaderboards() {
  const [refresh, setRefresh] = useState(0);
  const [target, setTarget] = useState<LeaderboardRow | null>(null);
  return (
    <>
      <ListView
        title="Leaderboards"
        fetch={api.leaderboards}
        paging="limit"
        refreshKey={refresh}
        localSearch={(l, q) => has(q, l.key, l.scope, l.periodKey)}
        columns={["Key", "Scope", "Period", "Entries", "Starts", "Ends", "Finalized", "Rewards paid", ""]}
        row={(l) => [
          <span className="font-mono text-xs">{l.key}</span>,
          l.scope,
          l.periodKey,
          formatInt(l._count.entries),
          dt(l.startsAt),
          dt(l.endsAt),
          dt(l.finalizedAt),
          l.rewardsDistributedAt ? <Badge tone="lime">{dt(l.rewardsDistributedAt)}</Badge> : "—",
          <RoleButton size="sm" variant="primary" min="SUPER_ADMIN" disabled={!!l.rewardsDistributedAt || l._count.entries === 0} onClick={() => setTarget(l)}>
            Distribute
          </RoleButton>,
        ]}
      />
      <DistributeModal target={target} onClose={() => setTarget(null)} onDone={() => setRefresh((n) => n + 1)} />
    </>
  );
}

export function Rooms() {
  return (
    <ListView
      title="Game rooms"
      fetch={api.rooms}
      paging="limit"
      statuses={["WAITING", "RUNNING", "ENDED"]}
      allStatusLabel="Running (default)"
      localSearch={(r, q) => has(q, r.roomId, r.id, r.mapKey, r.mode)}
      columns={["Room", "Match", "Mode", "Map", "Status", "Players", "Tick", "Started", "Ended", "Winner"]}
      row={(r) => [
        <Mono value={r.roomId} />,
        <Mono value={r.id} />,
        r.mode,
        r.mapKey,
        <StatusBadge status={r.status} />,
        `${r._count.players} / ${r.maxPlayers}`,
        `${r.tickRate} Hz`,
        dt(r.startedAt),
        dt(r.endedAt),
        <UserLink id={r.winnerUserId} />,
      ]}
    />
  );
}

export function Transactions() {
  const { token } = useSession();
  return (
    <ListView
      title="Transactions (ledger)"
      fetch={api.transactions}
      paging="server"
      serverSearch
      searchPlaceholder="User ID or journal ID (UUID)…"
      note="Server matches exact user or journal UUIDs; anything else lists all rows."
      columns={["Time", "Type", "Account", "User", "Direction", "Amount", "Balance after", "Journal", "Reference", "Meta"]}
      row={(l) => [
        dt(l.createdAt),
        <Badge tone="pink">{l.type.replace(/_/g, " ")}</Badge>,
        <span className="font-mono text-xs">{l.account.systemKey ?? l.account.kind}</span>,
        <UserLink id={l.userId} />,
        <StatusBadge status={l.direction} />,
        <b className={l.direction === "CREDIT" ? "text-lime-300" : "text-rose-300"}>
          {l.direction === "CREDIT" ? "+" : "−"}
          {money(l.amount, l.asset, token)}
        </b>,
        money(l.balanceAfter, l.asset, token),
        <Mono value={l.journalId} />,
        <Mono value={l.reference} />,
        <JsonCell value={l.metadata} />,
      ]}
    />
  );
}

export function Audit() {
  return (
    <ListView
      title="Audit log"
      fetch={api.audit}
      paging="server"
      serverSearch
      searchPlaceholder="Action contains (e.g. WITHDRAWAL)…"
      columns={["Time", "Actor", "Action", "Target", "User", "Reason", "IP", "Before", "After"]}
      row={(a) => [
        dt(a.createdAt),
        <span className="flex flex-col gap-0.5">
          <Badge tone={a.actorType === "ADMIN" ? "pink" : a.actorType === "SYSTEM" ? "cyan" : "slate"}>{a.actorType}</Badge>
          {a.adminUserId && <Mono value={a.adminUserId} />}
        </span>,
        <span className="font-mono text-xs font-semibold text-cyan-200">{a.action}</span>,
        <span className="text-xs">
          {a.targetType} <Mono value={a.targetId} />
        </span>,
        <UserLink id={a.userId} />,
        a.reason ? <span className="text-xs">{a.reason}</span> : "—",
        <span className="font-mono text-xs">{a.ip ?? "—"}</span>,
        <JsonCell value={a.before} />,
        <JsonCell value={a.after} />,
      ]}
    />
  );
}

export function AntiCheat() {
  return (
    <ListView
      title="Anti-cheat flags"
      fetch={api.anticheat}
      paging="server"
      localSearch={(f, q) => has(q, f.user.username, f.kind, f.userId, f.matchId)}
      searchPlaceholder="Filter by user, kind…"
      note={CLIENT_FILTER}
      columns={["Time", "User", "Risk", "Kind", "Severity", "Match", "Details"]}
      row={(f) => [
        dt(f.createdAt),
        <UserLink id={f.userId} name={f.user.username} />,
        <span className={f.user.riskScore >= 50 ? "font-bold text-rose-300" : undefined}>{f.user.riskScore}</span>,
        <span className="font-mono text-xs">{f.kind}</span>,
        <Badge tone={f.severity >= 3 ? "red" : f.severity >= 2 ? "amber" : "slate"}>sev {f.severity}</Badge>,
        <Mono value={f.matchId} />,
        <JsonCell value={f.details} />,
      ]}
    />
  );
}

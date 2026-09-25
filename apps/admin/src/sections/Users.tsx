import { Badge, Addr, StatusBadge, UserLink } from "../components/common";
import { ListView } from "../components/ListView";
import { api } from "../lib/api";
import { dt } from "../lib/format";
import { ROLE_COLOR } from "../lib/roles";

export function Users() {
  return (
    <ListView
      title="Users"
      fetch={api.users}
      paging="server"
      serverSearch
      searchPlaceholder="Username, wallet address or user ID…"
      statuses={["ACTIVE", "SUSPENDED", "BANNED"]}
      columns={["User", "Status", "Wallet", "Risk", "Flags", "Admin", "Last login", "Created"]}
      row={(u) => [
        <span className="flex flex-col">
          <UserLink id={u.id} name={u.username} />
          <span className="font-mono text-[10px] text-slate-500">{u.id}</span>
        </span>,
        <StatusBadge status={u.status} />,
        u.wallets[0] ? <Addr value={u.wallets[0].address} /> : <span className="text-slate-500">{u.isGuest ? "guest" : "—"}</span>,
        <span className={u.riskScore >= 50 ? "font-bold text-rose-300" : undefined}>{u.riskScore}</span>,
        <span className="flex flex-wrap gap-1">
          {u.withdrawalsSuspended && <Badge tone="red">wd blocked</Badge>}
          {u.isGuest && <Badge>guest</Badge>}
          {u.premiumTier !== "FREE" && <Badge tone="pink">{u.premiumTier}</Badge>}
          {u.kycStatus !== "NONE" && <Badge tone="cyan">kyc {u.kycStatus.toLowerCase()}</Badge>}
        </span>,
        u.admin?.active ? (
          <span className="text-xs font-bold" style={{ color: ROLE_COLOR[u.admin.role] }}>
            {u.admin.role}
          </span>
        ) : (
          "—"
        ),
        dt(u.lastLoginAt),
        dt(u.createdAt),
      ]}
    />
  );
}

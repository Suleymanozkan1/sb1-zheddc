import { Panel, cx, formatInt } from "@cryptoarena/ui";
import { useState, type ReactNode } from "react";
import { FundPoolModal } from "../components/actions";
import { ErrorBox, Loading, RoleButton } from "../components/common";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { navigate, type SectionId } from "../lib/router";
import { useSession } from "../lib/session";
import { useAsync } from "../lib/useAsync";

function Tile({ label, value, sub, tone = "cyan", to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "cyan" | "pink" | "lime" | "amber" | "red"; to?: SectionId }) {
  const color = { cyan: "#22d3ee", pink: "#e879f9", lime: "#a3e635", amber: "#fbbf24", red: "#f43f5e" }[tone];
  const body = (
    <>
      <span className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">{label}</span>
      <span className="font-display mt-1 text-2xl font-bold break-all" style={{ color, textShadow: `0 0 14px ${color}66` }}>
        {value}
      </span>
      {sub && <span className="mt-1 text-xs text-slate-400">{sub}</span>}
    </>
  );
  const cls = cx("glass flex flex-col p-4 text-left", tone === "red" && "border-rose-500/60 shadow-[0_0_24px_rgb(244_63_94/0.25)]");
  return to ? (
    <button type="button" className={cx(cls, "transition hover:border-cyan-400/40")} onClick={() => navigate({ section: to, user: null })}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Overview() {
  const { token } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [fundOpen, setFundOpen] = useState(false);
  const { data, error, loading, reload } = useAsync(api.overview, String(refresh));

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const imbalance = Object.entries(data.ledgerImbalance);
  const imbalanced = imbalance.filter(([, v]) => v !== "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Network <span className="font-mono text-cyan-200">{data.network}</span> · token <span className="font-mono text-cyan-200">{data.symbol}</span> ({data.decimals} decimals)
        </p>
        <div className="flex gap-2">
          <RoleButton size="sm" min="SUPER_ADMIN" variant="primary" onClick={() => setFundOpen(true)}>
            Fund reward pool
          </RoleButton>
          <RoleButton size="sm" min="SUPPORT" variant="ghost" onClick={() => void reload()} loading={loading}>
            ↻ Refresh
          </RoleButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Users" value={formatInt(data.users)} to="users" />
        <Tile label="Active matches" value={formatInt(data.activeMatches)} tone="lime" to="rooms" />
        <Tile
          label="Pending withdrawals"
          value={formatInt(data.pendingWithdrawals)}
          sub={
            <>
              <span className={data.reviewWithdrawals > 0 ? "font-semibold text-amber-300" : undefined}>{formatInt(data.reviewWithdrawals)} awaiting review</span> · pending + processing
            </>
          }
          tone={data.reviewWithdrawals > 0 ? "amber" : "cyan"}
          to="withdrawals"
        />
        <Tile label="Anti-cheat flags (24h)" value={formatInt(data.antiCheatFlags24h)} tone={data.antiCheatFlags24h > 0 ? "amber" : "cyan"} to="anticheat" />
        <Tile label="Deposits (24h)" value={money(data.deposits24h.amount, "CRYPTO", token)} sub={`${formatInt(data.deposits24h.count)} credited`} tone="lime" to="deposits" />
        <Tile label="Crypto rewards (24h)" value={money(data.cryptoRewards24h.amount, "CRYPTO", token)} sub={`${formatInt(data.cryptoRewards24h.count)} granted / capped`} tone="pink" to="rewards" />
        <Tile label="Reward pool balance" value={money(data.rewardPoolBalance, "CRYPTO", token)} sub="SYSTEM · CRYPTO_REWARD_POOL" tone="pink" />
        <Tile
          label="Ledger imbalance"
          value={imbalanced.length === 0 ? "Balanced" : `${imbalanced.length} asset${imbalanced.length > 1 ? "s" : ""} off`}
          sub={imbalanced.length === 0 ? "Σ credits − Σ debits = 0 for every asset" : "Double-entry invariant violated — investigate now"}
          tone={imbalanced.length === 0 ? "lime" : "red"}
          to="transactions"
        />
      </div>

      <Panel title="Ledger imbalance per asset">
        {imbalance.length === 0 ? (
          <p className="text-sm text-slate-400">No ledger rows yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {imbalance.map(([asset, v]) => (
              <div
                key={asset}
                className={cx("rounded-xl border px-4 py-3", v === "0" ? "border-white/10 bg-white/5" : "border-rose-500/60 bg-rose-500/15 shadow-[0_0_18px_rgb(244_63_94/0.3)]")}
              >
                <div className="text-[10px] tracking-widest text-slate-400 uppercase">{asset}</div>
                <div className={cx("font-display text-lg font-bold", v === "0" ? "text-lime-300" : "text-rose-300")}>{v === "0" ? "0" : `${v} base units`}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <FundPoolModal open={fundOpen} onClose={() => setFundOpen(false)} onDone={() => setRefresh((n) => n + 1)} />
    </div>
  );
}

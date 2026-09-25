import { LeaderboardScope } from "@cryptoarena/shared";
import { Panel, Spinner, Table, cx, formatInt } from "@cryptoarena/ui";
import { useState } from "react";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";

export function Leaderboard() {
  const [scope, setScope] = useState<LeaderboardScope>("GLOBAL");
  const lb = useAsync(() => api.leaderboard(scope), [scope]);
  const row = (r: NonNullable<typeof lb.data>["rows"][number]) => [
    <span className={cx("font-display font-bold", r.rank <= 3 && "text-amber-300")}>#{r.rank}</span>,
    r.username,
    formatInt(r.kills),
    formatInt(r.xp),
    formatInt(r.wins),
    <b className="text-cyan-300">{formatInt(r.score)}</b>,
  ];
  return (
    <Page title="Leaderboard" subtitle="Scores are computed only by the game server: kills ×10, creature kills ×2, wins ×50, XP ÷10.">
      <div className="mb-4 flex gap-1">
        {LeaderboardScope.map((s) => (
          <button key={s} onClick={() => setScope(s)} className={cx("rounded-lg px-4 py-1.5 text-xs font-bold tracking-wider", scope === s ? "bg-cyan-400 text-black" : "bg-white/5 text-slate-300")}>
            {s}
          </button>
        ))}
      </div>
      <Panel title={lb.data ? `${scope} · ${lb.data.periodKey}` : scope}>
        {lb.loading && !lb.data ? <Spinner /> : <Table columns={["Rank", "Player", "Kills", "XP", "Wins", "Score"]} rows={(lb.data?.rows ?? []).map(row)} empty="No scores yet — go play!" />}
        {lb.data?.me && lb.data.me.rank > (lb.data.rows.length || 0) && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <Table columns={["Rank", "Player", "Kills", "XP", "Wins", "Score"]} rows={[row(lb.data.me)]} />
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Daily and weekly boards pay performance-based rewards to the top 10 from the capped season reward pool when the period closes.</p>
      </Panel>
    </Page>
  );
}

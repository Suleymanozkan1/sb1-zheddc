import { Button, Panel, ProgressBar, Spinner, formatInt, formatToken } from "@cryptoarena/ui";
import { useState } from "react";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

export function Quests() {
  const { me, setBalances, toast } = useApp();
  const quests = useAsync(() => api.quests(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const groups = ["DAILY", "WEEKLY", "SEASONAL", "ACHIEVEMENT"] as const;
  const d = me?.balances.cryptoDecimals ?? 6;
  const sym = me?.balances.cryptoSymbol ?? "ARENA";

  return (
    <Page title="Quests" subtitle="Progress is tracked by the game server. Crypto quest rewards are paid from the season's capped reward budget.">
      {quests.loading && !quests.data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Panel key={g} title={g}>
              <ul className="flex flex-col gap-3">
                {(quests.data ?? [])
                  .filter((q) => q.period === g)
                  .map((q) => (
                    <li key={q.key} className="rounded-xl bg-white/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">
                            {q.name} {q.locked && <span className="text-xs text-amber-300">(premium)</span>}
                          </h3>
                          <p className="text-xs text-slate-400">{q.description}</p>
                          <p className="mt-1 text-[11px] text-slate-300">
                            {q.rewards.gold !== "0" && `🪙 ${formatInt(q.rewards.gold)}  `}
                            {q.rewards.gems !== "0" && `💎 ${formatInt(q.rewards.gems)}  `}
                            {q.rewards.xp > 0 && `✨ ${q.rewards.xp} XP  `}
                            {q.rewards.crypto !== "0" && <span className="text-fuchsia-300">◎ up to {formatToken(q.rewards.crypto, d)} {sym}</span>}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={q.completed && !q.claimed ? "success" : "secondary"}
                          disabled={!q.completed || q.claimed || q.locked}
                          loading={busy === q.key}
                          onClick={async () => {
                            setBusy(q.key);
                            try {
                              const res = await api.claimQuest(q.key);
                              setBalances(res.balances);
                              const capped = res.rewards.find((r) => r.status !== "GRANTED" && r.reason);
                              toast("success", capped ? `Claimed (${capped.reason})` : "Rewards claimed!");
                              await quests.reload();
                            } catch (err) {
                              toast("error", errorMessage(err));
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {q.claimed ? "Claimed" : q.completed ? "Claim" : `${formatInt(q.progress)}/${formatInt(q.target)}`}
                        </Button>
                      </div>
                      <ProgressBar value={q.progress} max={q.target} className="mt-2" color={q.completed ? "#a3e635" : "#22d3ee"} />
                    </li>
                  ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}

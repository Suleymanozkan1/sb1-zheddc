import { Button, cx, formatInt, formatToken } from "@cryptoarena/ui";
import type { ReactNode } from "react";
import { isDemo } from "../lib/demo";
import { signOut } from "../lib/session";
import { useApp, type Screen } from "../lib/store";

const NAV: { key: Screen; label: string }[] = [
  { key: "dashboard", label: "Play" },
  { key: "characters", label: "Characters" },
  { key: "inventory", label: "Inventory" },
  { key: "shop", label: "Shop" },
  { key: "wallet", label: "Wallet" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "quests", label: "Quests" },
  { key: "settings", label: "Settings" },
];

export function Toasts() {
  const { toasts, dismiss } = useApp();
  const colors = { info: "border-cyan-400/50", success: "border-lime-400/60", error: "border-rose-500/70", reward: "border-fuchsia-400/60" };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)} className={cx("glass pointer-events-auto border-l-4 px-4 py-3 text-left text-sm", colors[t.kind])}>
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function TopBar() {
  const { me, go, screen } = useApp();
  if (!me) return null;
  const b = me.balances;
  const demo = isDemo();
  return (
    <header className="glass sticky top-0 z-40 m-2 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2 md:m-3">
      <button onClick={() => go("dashboard")} className="font-display text-lg font-black tracking-widest text-cyan-300 neon-text">
        CRYPTO<span className="text-fuchsia-400">ARENA</span>
      </button>
      {demo && (
        <span title="Offline demo: progress is stored in this browser only" className="rounded bg-amber-400/20 px-2 py-0.5 font-display text-[10px] font-bold tracking-widest text-amber-300">
          DEMO
        </span>
      )}
      <nav className="order-3 flex w-full gap-1 overflow-x-auto xl:order-none xl:w-auto xl:flex-1 xl:justify-center">
        {NAV.filter((n) => !demo || n.key !== "wallet").map((n) => (
          <button
            key={n.key}
            onClick={() => go(n.key)}
            className={cx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wider whitespace-nowrap uppercase transition",
              screen === n.key ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-white",
            )}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
        <span title="Gold">🪙 {formatInt(b.gold)}</span>
        <span title="Gems">💎 {formatInt(b.gems)}</span>
        {!demo && (
          <span title="Withdrawable rewards" className="text-fuchsia-300">
            ◎ {formatToken(b.cryptoReward, b.cryptoDecimals, 2)}
          </span>
        )}
        <button onClick={() => go("settings")} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 hover:bg-white/10">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-[10px] font-black text-black">{me.username.slice(0, 2).toUpperCase()}</span>
          <span className="hidden sm:inline">{me.username}</span>
          {me.premiumTier !== "FREE" && <span className="rounded bg-amber-400/20 px-1 text-[10px] text-amber-300">{me.premiumTier}</span>}
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void signOut()}
        >
          Logout
        </Button>
      </div>
    </header>
  );
}

export function Page({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-16 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 pt-4">
        <div>
          <h1 className="font-display text-2xl font-black tracking-wider md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  );
}

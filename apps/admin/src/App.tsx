import type { AdminRole, MeDto } from "@cryptoarena/shared";
import { Button, Spinner, cx } from "@cryptoarena/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { ErrorBox } from "./components/common";
import { LoginScreen, NotAuthorized } from "./components/Gate";
import { ApiError, api, errorMessage } from "./lib/api";
import { ROLE_COLOR, hasRole } from "./lib/roles";
import { SECTIONS, href, navigate, useRoute, type SectionId } from "./lib/router";
import { SessionCtx, type Session, type TokenMeta } from "./lib/session";
import { Overview } from "./sections/Overview";
import { UserDrawer } from "./sections/UserDrawer";
import { Users } from "./sections/Users";
import {
  AntiCheat,
  Audit,
  Characters,
  Deposits,
  Items,
  Leaderboards,
  Purchases,
  Rewards,
  Rooms,
  Seasons,
  Shop,
  Transactions,
  Wallets,
  Withdrawals,
} from "./sections/lists";

const VIEWS: Record<SectionId, ComponentType> = {
  overview: Overview,
  users: Users,
  wallets: Wallets,
  deposits: Deposits,
  withdrawals: Withdrawals,
  rewards: Rewards,
  items: Items,
  characters: Characters,
  shop: Shop,
  purchases: Purchases,
  seasons: Seasons,
  leaderboards: Leaderboards,
  rooms: Rooms,
  transactions: Transactions,
  audit: Audit,
  anticheat: AntiCheat,
};

/** Minimum role the server requires to read each section (everything else is SUPPORT). */
const SECTION_MIN: Partial<Record<SectionId, AdminRole>> = { audit: "ADMIN", anticheat: "MODERATOR" };

type AuthState = { kind: "loading" } | { kind: "anon" } | { kind: "error"; message: string } | { kind: "user"; me: MeDto };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const wallet = useWallet();

  const check = useCallback(async () => {
    setAuth({ kind: "loading" });
    try {
      setAuth({ kind: "user", me: await api.me() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuth({ kind: "anon" });
      else setAuth({ kind: "error", message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Cookies are cleared server-side when possible; fall through to the login screen regardless.
    }
    if (wallet.connected) await wallet.disconnect().catch(() => undefined);
    setAuth({ kind: "anon" });
  }, [wallet]);

  const onSignedIn = useCallback((me: MeDto) => setAuth({ kind: "user", me }), []);

  if (auth.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-cyan-300">
        <Spinner />
      </div>
    );
  }
  if (auth.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <ErrorBox>Could not reach the API: {auth.message}</ErrorBox>
        <Button onClick={() => void check()}>Retry</Button>
      </div>
    );
  }
  if (auth.kind === "anon") return <LoginScreen onSignedIn={onSignedIn} onRetry={() => void check()} />;
  if (!auth.me.adminRole) return <NotAuthorized me={auth.me} onLogout={() => void logout()} onRetry={() => void check()} />;
  return <Console me={auth.me} role={auth.me.adminRole} onLogout={() => void logout()} />;
}

function Console({ me, role, onLogout }: { me: MeDto; role: AdminRole; onLogout: () => void }) {
  const route = useRoute();
  const [token, setToken] = useState<TokenMeta | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // decimals/symbol for formatting crypto amounts come from the overview endpoint.
  useEffect(() => {
    api
      .overview()
      .then((o) => setToken({ decimals: o.decimals, symbol: o.symbol, network: o.network }))
      .catch((err: unknown) => {
        setTokenError(errorMessage(err));
        setToken({ decimals: me.balances.cryptoDecimals, symbol: me.balances.cryptoSymbol, network: "unknown" });
      });
  }, [me]);

  const openUser = useCallback((id: string) => navigate({ section: route.section, user: id }), [route.section]);
  const session = useMemo<Session | null>(() => (token ? { me, role, token, logout: onLogout, openUser } : null), [me, role, token, onLogout, openUser]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-cyan-300">
        <Spinner />
      </div>
    );
  }

  const View = VIEWS[route.section];
  const current = SECTIONS.find((s) => s.id === route.section);
  const needed = SECTION_MIN[route.section];

  return (
    <SessionCtx.Provider value={session}>
      <div className="flex min-h-full flex-col md:flex-row">
        {/* Sidebar (desktop) / top bar + scrollable tabs (mobile) */}
        <aside className="sticky top-0 z-30 border-b border-white/10 bg-[#05060f]/90 backdrop-blur-xl md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3 md:block md:py-5">
            <a href={href({ section: "overview", user: null })} className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="h-8 w-8" />
              <span className="leading-tight">
                <span className="font-display block text-sm font-black tracking-[0.18em] text-cyan-100">CRYPTOARENA</span>
                <span className="font-display block text-[9px] tracking-[0.35em] text-fuchsia-300">ADMIN</span>
              </span>
            </a>
            <div className="flex items-center gap-2 md:hidden">
              <RolePill role={role} />
              <Button size="sm" variant="ghost" onClick={onLogout}>
                Sign out
              </Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-3 md:pb-4" aria-label="Sections">
            {SECTIONS.map((s) => {
              const min = SECTION_MIN[s.id];
              const locked = !!min && !hasRole(role, min);
              const active = route.section === s.id;
              return (
                <a
                  key={s.id}
                  href={href({ section: s.id, user: null })}
                  title={locked ? `Requires ${min}` : undefined}
                  className={cx(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap transition md:text-sm",
                    active ? "bg-gradient-to-r from-cyan-400/20 to-fuchsia-500/10 text-cyan-100 shadow-[inset_2px_0_0_#22d3ee]" : "text-slate-400 hover:bg-white/5 hover:text-white",
                    locked && "opacity-40",
                  )}
                >
                  <span className="w-4 text-center text-cyan-300/80">{s.icon}</span>
                  {s.label}
                  {locked && <span className="ml-auto text-[10px]">🔒</span>}
                </a>
              );
            })}
          </nav>
          <div className="hidden border-t border-white/10 px-4 py-4 md:block">
            <p className="truncate text-sm font-semibold text-white" title={me.id}>
              {me.username}
            </p>
            <div className="mt-1 mb-3">
              <RolePill role={role} />
            </div>
            <Button size="sm" className="w-full" onClick={onLogout}>
              Sign out
            </Button>
            <p className="mt-3 text-[10px] leading-snug text-slate-500">Session cookies are shared with the game client on this host.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-3 md:p-6">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h1 className="font-display neon-text text-xl font-bold tracking-[0.12em] text-cyan-100 uppercase md:text-2xl">{current?.label}</h1>
            {tokenError && <span className="text-xs text-amber-300">Token metadata unavailable ({tokenError}); using defaults.</span>}
          </header>
          {needed && !hasRole(role, needed) ? (
            <ErrorBox>
              This section requires the {needed} role (you are {role}).
            </ErrorBox>
          ) : (
            <View key={route.section} />
          )}
        </main>
      </div>
      {route.user && <UserDrawer key={route.user} userId={route.user} onClose={() => navigate({ section: route.section, user: null })} />}
    </SessionCtx.Provider>
  );
}

function RolePill({ role }: { role: AdminRole }) {
  const c = ROLE_COLOR[role];
  return (
    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase" style={{ color: c, borderColor: `${c}66`, background: `${c}14` }}>
      {role.replace("_", " ")}
    </span>
  );
}

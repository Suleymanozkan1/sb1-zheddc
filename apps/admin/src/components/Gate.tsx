import type { MeDto } from "@cryptoarena/shared";
import { Button, Panel } from "@cryptoarena/ui";
import type { ReactNode } from "react";
import { RECOMMENDED_WALLETS } from "../wallet/WalletProviders";
import { useWalletAuth } from "../wallet/useWalletAuth";
import { ErrorBox } from "./common";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="grid-bg flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-14 w-14 drop-shadow-[0_0_18px_rgb(232_121_249/0.6)]" />
          <h1 className="font-display neon-text text-2xl font-black tracking-[0.2em] text-cyan-100">CRYPTOARENA</h1>
          <p className="font-display text-xs tracking-[0.4em] text-fuchsia-300">ADMIN CONSOLE</p>
        </div>
        {children}
      </div>
    </div>
  );
}

const SharedCookieNote = () => (
  <p className="mt-4 text-xs leading-relaxed text-slate-500">
    Session cookies are shared with the game client on the same host (cookies are scoped by host, not port). In development, signing in on the game client (
    <span className="font-mono">localhost:5173</span>) also signs you in here — just reload.
  </p>
);

export function LoginScreen({ onSignedIn, onRetry }: { onSignedIn: (me: MeDto) => void; onRetry: () => void }) {
  const { signIn, busy, error, wallet } = useWalletAuth(onSignedIn);
  return (
    <Frame>
      <Panel title="Sign in">
        <p className="mb-4 text-sm text-slate-300">Authenticate with the Solana wallet linked to your admin account. You will be asked to sign a one-time message — no transaction, no fees.</p>
        <Button variant="primary" size="lg" className="w-full" onClick={() => void signIn()} loading={busy}>
          {wallet.connected && wallet.publicKey ? "Sign message to continue" : "Connect Wallet"}
        </Button>
        <p className="mt-2 text-center text-xs text-slate-500">Supports {RECOMMENDED_WALLETS.join(", ")} and any Wallet Standard wallet.</p>
        {wallet.connected && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Connected: <span className="font-mono">{wallet.publicKey?.toBase58()}</span> ·{" "}
            <button className="text-cyan-300 hover:underline" onClick={() => void wallet.disconnect()}>
              disconnect
            </button>
          </p>
        )}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="ghost" onClick={onRetry}>
            ↻ I signed in elsewhere — check again
          </Button>
        </div>
        <SharedCookieNote />
      </Panel>
    </Frame>
  );
}

export function NotAuthorized({ me, onLogout, onRetry }: { me: MeDto; onLogout: () => void; onRetry: () => void }) {
  const target = me.wallets[0]?.address ?? me.username;
  return (
    <Frame>
      <Panel title="Not authorized">
        <p className="mb-3 text-sm text-slate-300">
          You are signed in as <b className="text-white">{me.username}</b>, but this account has no active admin role.
        </p>
        <p className="mb-1 text-xs tracking-wider text-slate-400 uppercase">Grant a role from the repo root</p>
        <pre className="mb-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs text-lime-300">pnpm admin:grant {target} SUPER_ADMIN</pre>
        <p className="mb-4 text-xs text-slate-500">
          Grant a role with <code className="text-slate-300">pnpm admin:grant &lt;username|wallet&gt; SUPER_ADMIN</code>, then check again.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onRetry}>
            ↻ Check again
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            Sign out
          </Button>
        </div>
        <SharedCookieNote />
      </Panel>
    </Frame>
  );
}

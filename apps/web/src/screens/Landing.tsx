import { Button, Modal } from "@cryptoarena/ui";
import { useState } from "react";
import { api } from "../lib/api";
import { DEMO_ONLY, setDemo } from "../lib/demo";
import { errorMessage, useApp } from "../lib/store";
import { useWalletAuth } from "../wallet/useWalletAuth";

export function Landing() {
  const { setMe, go, toast } = useApp();
  const { signIn, busy } = useWalletAuth();
  const [open, setOpen] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  const startDemo = async () => {
    setDemo(true);
    try {
      setMe(await api.guest());
      go("dashboard");
    } catch (err) {
      setDemo(false);
      toast("error", errorMessage(err));
    }
  };

  return (
    <div className="grid-bg relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_40%,rgb(34_211_238/0.15),transparent_60%)]" />
      <p className="mb-4 text-xs font-semibold tracking-[0.4em] text-cyan-300/80 uppercase">Real-time multiplayer · Solana devnet</p>
      <h1 className="font-display text-5xl font-black tracking-widest md:text-8xl">
        <span className="text-cyan-300 neon-text">CRYPTO</span>
        <span className="text-fuchsia-400">ARENA</span>
      </h1>
      <p className="mt-6 max-w-2xl text-slate-300 md:text-lg">
        Pick a hero, drop into a 10,000×10,000 neon battlefield, farm resources, slay creatures and outplay rivals. Earn gear, climb seasonal leaderboards and win
        performance-based rewards.
      </p>
      <Button variant="primary" size="xl" className="mt-10 font-display" onClick={() => (DEMO_ONLY ? void startDemo() : setOpen(true))}>
        {DEMO_ONLY ? "PLAY DEMO" : "PLAY NOW"}
      </Button>
      {DEMO_ONLY && (
        <p className="mt-3 max-w-md text-xs text-slate-400">
          Offline demo: the arena runs in your browser against bots. Progress is saved on this device; wallets and crypto rewards are disabled.
        </p>
      )}
      <div className="mt-12 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
        {[
          ["⚔️ Skill first", "Server-authoritative combat: aim, dodge, dash. No pay-to-win damage numbers from the client."],
          ["🧬 Grow your hero", "5 classes, 50 levels, stat upgrades, 6 rarities of gear with +20 upgrades."],
          ["🏆 Compete", "Quests, daily/weekly/season leaderboards and ranked matches with capped reward pools."],
        ].map(([t, d]) => (
          <div key={t} className="glass p-4">
            <h3 className="font-display text-sm font-bold text-cyan-200">{t}</h3>
            <p className="mt-1 text-sm text-slate-400">{d}</p>
          </div>
        ))}
      </div>
      <p className="mt-10 max-w-2xl text-xs text-slate-500">
        CryptoArena is a game, not an investment. Purchases buy in-game items and utility only. Rewards depend on gameplay performance, are paid from finite reward
        budgets and are never guaranteed. Availability of crypto features may be restricted in some regions.
      </p>

      <Modal open={open} onClose={() => setOpen(false)} title="Enter the arena">
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" loading={busy} onClick={() => void signIn()}>
            Connect Wallet (Phantom · Solflare · Backpack)
          </Button>
          <Button
            size="lg"
            loading={guestBusy}
            onClick={async () => {
              setGuestBusy(true);
              try {
                setMe(await api.guest());
                go("dashboard");
              } catch (err) {
                toast("error", errorMessage(err));
              } finally {
                setGuestBusy(false);
              }
            }}
          >
            Play as Guest
          </Button>
          <Button size="lg" variant="ghost" onClick={() => void startDemo()}>
            Try the offline demo
          </Button>
          <p className="text-xs text-slate-400">
            Guests keep their progress on this device and can link a wallet later to unlock deposits, crypto rewards and withdrawals. The offline demo runs entirely in
            your browser against bots, without an account.
          </p>
        </div>
      </Modal>
    </div>
  );
}

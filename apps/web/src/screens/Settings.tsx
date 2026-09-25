import { Button, Panel, shortAddress } from "@cryptoarena/ui";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import { useWalletAuth } from "../wallet/useWalletAuth";

export function Settings() {
  const { me, settings, updateSettings, setMe, go } = useApp();
  const { linkWallet, busy } = useWalletAuth();
  if (!me) return null;
  const toggle = (k: keyof typeof settings, label: string) => (
    <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
      {label}
      <input type="checkbox" checked={settings[k]} onChange={(e) => updateSettings({ [k]: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
    </label>
  );
  return (
    <Page title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-400">Username</dt>
            <dd>{me.username}</dd>
            <dt className="text-slate-400">Account type</dt>
            <dd>{me.isGuest ? "Guest" : "Wallet"}</dd>
            <dt className="text-slate-400">Premium</dt>
            <dd>{me.premiumTier}{me.premiumUntil ? ` until ${new Date(me.premiumUntil).toLocaleDateString()}` : ""}</dd>
            <dt className="text-slate-400">Wallets</dt>
            <dd>{me.wallets.map((w) => shortAddress(w.address)).join(", ") || "—"}</dd>
            {me.adminRole && (
              <>
                <dt className="text-slate-400">Admin role</dt>
                <dd className="text-amber-300">{me.adminRole}</dd>
              </>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} onClick={() => void linkWallet()}>
              {me.wallets.length ? "Link another wallet" : "Link wallet"}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api.logout().catch(() => undefined);
                setMe(null);
                go("landing");
              }}
            >
              Log out
            </Button>
          </div>
        </Panel>
        <Panel title="Game">
          <div className="flex flex-col gap-2">
            {toggle("showDamageNumbers", "Show damage numbers")}
            {toggle("screenShake", "Screen shake")}
            {toggle("showFps", "Show FPS / ping")}
          </div>
        </Panel>
        <Panel title="Fair play & compliance" className="md:col-span-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
            <li>All game outcomes (movement, damage, loot, XP, rewards) are decided by the server. Client modifications cannot change them.</li>
            <li>Rewards are performance-based and paid from finite, publicly capped reward pools. Spending money does not guarantee any return.</li>
            <li>Crypto features may be unavailable in some regions or require age / identity verification.</li>
            <li>Suspicious activity (bots, exploits, multi-accounting) can lead to withdrawal review or account suspension.</li>
          </ul>
        </Panel>
      </div>
    </Page>
  );
}

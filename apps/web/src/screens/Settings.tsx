import { Button, Panel, shortAddress } from "@cryptoarena/ui";
import { Page } from "../components/Layout";
import { signOut } from "../lib/session";
import { useApp } from "../lib/store";
import { isDemo } from "../lib/demo";
import { LANGS, useT } from "../lib/i18n";
import { useWalletAuth } from "../wallet/useWalletAuth";

export function Settings() {
  const { me, settings, updateSettings, lang, setLang } = useApp();
  const t = useT();
  const { linkWallet, busy } = useWalletAuth();
  if (!me) return null;
  const toggle = (k: keyof typeof settings, label: string) => (
    <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
      {t(label)}
      <input type="checkbox" checked={settings[k]} onChange={(e) => updateSettings({ [k]: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
    </label>
  );
  return (
    <Page title={t("Settings")}>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("Account")}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-400">{t("Username")}</dt>
            <dd>{me.username}</dd>
            <dt className="text-slate-400">{t("Account type")}</dt>
            <dd>{isDemo() ? t("Offline demo") : me.isGuest ? t("Guest") : t("Wallet")}</dd>
            <dt className="text-slate-400">{t("Premium")}</dt>
            <dd>
              {me.premiumTier === "FREE" ? t("FREE") : me.premiumTier}
              {me.premiumUntil ? ` ${t("until {date}", { date: new Date(me.premiumUntil).toLocaleDateString(lang) })}` : ""}
            </dd>
            <dt className="text-slate-400">{t("Wallets")}</dt>
            <dd>{me.wallets.map((w) => shortAddress(w.address)).join(", ") || "—"}</dd>
            {me.adminRole && (
              <>
                <dt className="text-slate-400">{t("Admin role")}</dt>
                <dd className="text-amber-300">{me.adminRole}</dd>
              </>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {!isDemo() && (
              <Button variant="primary" loading={busy} onClick={() => void linkWallet()}>
                {me.wallets.length ? t("Link another wallet") : t("Link wallet")}
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => void signOut()}
            >
              {t("Log out")}
            </Button>
          </div>
        </Panel>
        <Panel title={t("Game")}>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              {t("Language")}
              <select value={lang} onChange={(e) => setLang(e.target.value === "tr" ? "tr" : "en")} className="rounded-md bg-slate-900 px-2 py-1 text-sm text-slate-100">
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {toggle("showDamageNumbers", "Show damage numbers")}
            {toggle("screenShake", "Screen shake")}
            {toggle("showFps", "Show FPS / ping")}
            {toggle("highQuality", "High quality effects (bloom, particles)")}
          </div>
        </Panel>
        <Panel title={t("Fair play & compliance")} className="md:col-span-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
            <li>{t("All game outcomes (movement, damage, loot, XP, rewards) are decided by the server. Client modifications cannot change them.")}</li>
            <li>{t("Rewards are performance-based and paid from finite, publicly capped reward pools. Spending money does not guarantee any return.")}</li>
            <li>{t("Crypto features may be unavailable in some regions or require age / identity verification.")}</li>
            <li>{t("Suspicious activity (bots, exploits, multi-accounting) can lead to withdrawal review or account suspension.")}</li>
          </ul>
        </Panel>
      </div>
    </Page>
  );
}

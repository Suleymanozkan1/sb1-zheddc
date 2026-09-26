import { parseUnits } from "@cryptoarena/shared";
import { Button, Panel, Spinner, Stat, Table, formatToken, shortAddress } from "@cryptoarena/ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { getBase64Encoder } from "@solana/kit";
import { useState } from "react";
import { Page } from "../components/Layout";
import { api, newKey } from "../lib/api";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";
import { useWalletAuth } from "../wallet/useWalletAuth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Wallet() {
  const { me, toast, setBalances } = useApp();
  const info = useAsync(() => api.wallet(), []);
  const ledger = useAsync(() => api.ledger(), []);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { linkWallet, busy: linking } = useWalletAuth();
  const [depositAmount, setDepositAmount] = useState("10");
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [withdrawKey, setWithdrawKey] = useState(newKey());

  if (!me) return null;
  const w = info.data;
  const d = w?.decimals ?? me.balances.cryptoDecimals;
  const sym = w?.symbol ?? me.balances.cryptoSymbol;
  const fmt = (v: string) => formatToken(v, d);

  const refresh = async () => {
    await Promise.all([info.reload(), ledger.reload()]);
    const fresh = await api.me();
    setBalances(fresh.balances);
  };

  const deposit = async () => {
    setBusy("deposit");
    setDepositStatus("Preparing transaction…");
    try {
      parseUnits(depositAmount, d);
      const prep = await api.prepareDeposit(depositAmount);
      let signature: string;
      if (prep.mock || !prep.transaction) {
        setDepositStatus("Simulating wallet transfer (SOLANA_MOCK)…");
        signature = (await api.mockSendDeposit(prep.depositId)).signature;
      } else {
        if (!wallet.connected || !wallet.publicKey) throw new Error("Connect your wallet first");
        if (wallet.publicKey.toBase58() !== prep.wallet) throw new Error(`Switch your wallet to ${shortAddress(prep.wallet)} (the one linked to this account)`);
        const tx = VersionedTransaction.deserialize(Uint8Array.from(getBase64Encoder().encode(prep.transaction)));
        setDepositStatus("Approve the transfer in your wallet…");
        signature = await wallet.sendTransaction(tx, connection);
      }
      setDepositStatus("Waiting for finalization on-chain…");
      for (let i = 0; i < 40; i++) {
        const res = await api.verifyDeposit(prep.depositId, signature);
        if (res.status === "CREDITED") {
          toast("success", `Deposit of ${fmt(res.deposit.amount)} ${sym} credited`);
          setDepositStatus(null);
          await refresh();
          return;
        }
        if (res.status === "FAILED") throw new Error(res.reason ?? "Deposit verification failed");
        await sleep(3000);
      }
      setDepositStatus("Still confirming — it will be credited automatically once finalized.");
    } catch (err) {
      toast("error", errorMessage(err));
      setDepositStatus(null);
    } finally {
      setBusy(null);
      void info.reload();
    }
  };

  const withdraw = async () => {
    setBusy("withdraw");
    try {
      const to = withdrawTo || w?.wallets[0]?.address || "";
      const res = await api.withdraw(withdrawAmount, to, withdrawKey);
      toast("success", res.withdrawal.requiresReview ? "Withdrawal submitted for review" : "Withdrawal queued — it will be sent shortly");
      setWithdrawKey(newKey());
      setWithdrawAmount("");
      await refresh();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title="Wallet" subtitle={w ? `Network: ${w.network}${w.mint ? ` · Mint ${shortAddress(w.mint)}` : ""}` : undefined} actions={<Button onClick={() => void refresh()}>Refresh</Button>}>
      {!w ? (
        info.error ? <p className="text-rose-300">{info.error}</p> : <Spinner />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Balances">
            <div className="grid grid-cols-2 gap-4">
              <Stat label={`Withdrawable (${sym})`} value={fmt(w.balances.cryptoReward)} accent="#e879f9" />
              <Stat label={`Deposited (${sym})`} value={fmt(w.balances.cryptoSpendable)} accent="#a3e635" />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Deposited funds are for shop purchases (gems, passes, items). Only rewards earned through gameplay are withdrawable. There is no interest, yield or guaranteed return.
            </p>
            <h3 className="mt-5 mb-2 text-xs font-bold tracking-widest text-slate-400 uppercase">Linked wallets</h3>
            {w.wallets.length === 0 ? (
              <Button variant="primary" loading={linking} onClick={() => void linkWallet()}>
                Connect & verify wallet
              </Button>
            ) : (
              <ul className="text-sm">
                {w.wallets.map((x) => (
                  <li key={x.address} className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-mono">{shortAddress(x.address)}</span>
                    {x.isPrimary && <span className="text-xs text-cyan-300">primary</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Deposit Crypto">
            <p className="mb-3 text-sm text-slate-400">
              The server builds an SPL token transfer of {sym} to the treasury. Your wallet signs it; the server verifies network, mint, amount, recipient, reference and finality before crediting — exactly once.
            </p>
            <div className="flex gap-2">
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-cyan-400" placeholder="Amount" inputMode="decimal" />
              <Button variant="primary" loading={busy === "deposit"} disabled={w.wallets.length === 0 || me.isGuest} onClick={() => void deposit()}>
                Deposit
              </Button>
            </div>
            {depositStatus && <p className="mt-2 text-xs text-cyan-300">{depositStatus}</p>}
            {!w.mint && <p className="mt-2 text-xs text-amber-300">Deposits are not configured on this server (REWARD_TOKEN_MINT).</p>}
          </Panel>

          <Panel title="Withdraw">
            <div className="flex flex-col gap-2">
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-cyan-400" placeholder={`Amount (${sym})`} inputMode="decimal" />
              <select value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                {w.wallets.map((x) => (
                  <option key={x.address} value={x.address}>
                    {x.address}
                  </option>
                ))}
              </select>
              <Button variant="primary" loading={busy === "withdraw"} disabled={!withdrawAmount || w.wallets.length === 0} onClick={() => void withdraw()}>
                Withdraw
              </Button>
              <ul className="mt-1 text-[11px] text-slate-400">
                <li>
                  Min {fmt(w.limits.minWithdrawal)} · Max {fmt(w.limits.maxWithdrawal)} · Fee {fmt(w.limits.fee)} {sym}
                </li>
                <li>
                  Daily limit {fmt(w.limits.dailyLimit)} (used {fmt(w.limits.withdrawnToday)}) · Cooldown {Math.round(w.limits.cooldownSeconds / 60)} min
                </li>
                <li>Account must be {w.limits.minAccountAgeHours}h old. Only verified wallets of this account can receive withdrawals.</li>
                {w.limits.nextWithdrawalAt && <li className="text-amber-300">Next withdrawal: {new Date(w.limits.nextWithdrawalAt).toLocaleString()}</li>}
              </ul>
            </div>
          </Panel>

          <Panel title="Withdrawals" className="xl:col-span-2">
            <Table
              columns={["Date", "Amount", "Status", "Transaction", ""]}
              rows={w.withdrawals.map((x) => [
                new Date(x.createdAt).toLocaleString(),
                `${fmt(x.amount)} ${sym}`,
                <span className={x.status === "COMPLETED" ? "text-lime-300" : x.status === "FAILED" ? "text-rose-300" : "text-amber-300"}>
                  {x.status}
                  {x.requiresReview && x.status === "PENDING" ? " (review)" : ""}
                </span>,
                x.explorerUrl ? (
                  <a className="text-cyan-300 underline" href={x.explorerUrl} target="_blank" rel="noreferrer">
                    {shortAddress(x.signature ?? "")}
                  </a>
                ) : x.signature ? (
                  <span className="font-mono text-xs">{shortAddress(x.signature)}</span>
                ) : (
                  "—"
                ),
                x.status === "PENDING" ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.cancelWithdrawal(x.id);
                        await refresh();
                      } catch (err) {
                        toast("error", errorMessage(err));
                      }
                    }}
                  >
                    Cancel
                  </Button>
                ) : null,
              ])}
            />
          </Panel>
          <Panel title="Deposits">
            <Table
              columns={["Date", "Amount", "Status"]}
              rows={w.deposits.map((x) => [new Date(x.createdAt).toLocaleDateString(), `${fmt(x.amount)}`, <span title={x.failureReason ?? ""}>{x.status}</span>])}
            />
          </Panel>
          <Panel title="Ledger (append-only)" className="xl:col-span-3">
            <Table
              columns={["Date", "Type", "Account", "Change", "Balance after", "Reference"]}
              rows={(ledger.data ?? []).map((e) => {
                const isCrypto = e.asset === "CRYPTO";
                const amt = isCrypto ? fmt(e.amount) : e.amount;
                const after = isCrypto ? fmt(e.balanceAfter) : e.balanceAfter;
                return [
                  new Date(e.createdAt).toLocaleString(),
                  e.type,
                  e.account,
                  <span className={e.direction === "CREDIT" ? "text-lime-300" : "text-rose-300"}>
                    {e.direction === "CREDIT" ? "+" : "−"}
                    {amt}
                  </span>,
                  after,
                  <span className="font-mono text-xs">{e.reference ? shortAddress(e.reference) : ""}</span>,
                ];
              })}
            />
          </Panel>
        </div>
      )}
    </Page>
  );
}

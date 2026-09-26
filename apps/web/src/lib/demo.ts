// Offline demo mode: the whole game runs in the browser against a local, simulated account.
// Nothing in the demo touches the real API, the ledger, wallets or the blockchain.

/** Build-time switch for deployments without a backend (e.g. a static Vercel preview). */
export const DEMO_ONLY = (import.meta.env.VITE_DEMO_ONLY as string | undefined) === "true";

const KEY = "ca.demo";

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let active = DEMO_ONLY || stored();

export function isDemo(): boolean {
  return active;
}

export function setDemo(on: boolean): void {
  active = DEMO_ONLY || on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the flag lives for this page load only */
  }
}

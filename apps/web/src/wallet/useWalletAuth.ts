import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getBase58Decoder } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { errorMessage, useApp } from "../lib/store";

/**
 * Wallet sign-in: backend nonce → wallet signs the message → backend verifies the ed25519
 * signature and issues an HttpOnly session. The public key alone is never trusted.
 */
export function useWalletAuth() {
  const wallet = useWallet();
  const modal = useWalletModal();
  const { setMe, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const pending = useRef<"LOGIN" | "LINK_WALLET" | null>(null);

  const sign = useCallback(
    async (purpose: "LOGIN" | "LINK_WALLET") => {
      if (!wallet.publicKey || !wallet.signMessage) {
        toast("error", "This wallet does not support message signing");
        return;
      }
      setBusy(true);
      try {
        const address = wallet.publicKey.toBase58();
        const { nonce, message } = await api.nonce(address, purpose);
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signature = getBase58Decoder().decode(sig);
        const me = purpose === "LOGIN" ? await api.verify(address, nonce, signature) : await api.linkWallet(address, nonce, signature);
        setMe(me);
        toast("success", purpose === "LOGIN" ? "Wallet connected — welcome!" : "Wallet linked to your account");
      } catch (err) {
        toast("error", errorMessage(err));
      } finally {
        setBusy(false);
        pending.current = null;
      }
    },
    [wallet, setMe, toast],
  );

  // Continue the flow once the user picked a wallet in the modal.
  useEffect(() => {
    if (wallet.connected && pending.current) {
      // Clear before the async flow so wallet state changes during signing cannot start it twice.
      const purpose = pending.current;
      pending.current = null;
      void sign(purpose);
    }
  }, [wallet.connected, sign]);

  const start = useCallback(
    (purpose: "LOGIN" | "LINK_WALLET") => {
      if (wallet.connected) return sign(purpose);
      pending.current = purpose;
      modal.setVisible(true);
      return Promise.resolve();
    },
    [wallet.connected, sign, modal],
  );

  return { signIn: () => start("LOGIN"), linkWallet: () => start("LINK_WALLET"), busy, wallet };
}

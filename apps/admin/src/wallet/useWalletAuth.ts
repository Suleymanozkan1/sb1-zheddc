import { getBase58Decoder } from "@solana/kit";
import type { MeDto } from "@cryptoarena/shared";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";

/**
 * Wallet sign-in: backend nonce → wallet signs the message → backend verifies the ed25519
 * signature and issues an HttpOnly session. The public key alone is never trusted.
 */
export function useWalletAuth(onSignedIn: (me: MeDto) => void) {
  const wallet = useWallet();
  const modal = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const sign = useCallback(async () => {
    pending.current = false;
    if (!wallet.publicKey || !wallet.signMessage) {
      setError("This wallet does not support message signing");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const address = wallet.publicKey.toBase58();
      const { nonce, message } = await api.nonce(address);
      const sig = await wallet.signMessage(new TextEncoder().encode(message));
      const signature = getBase58Decoder().decode(sig);
      onSignedIn(await api.verify(address, nonce, signature));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, onSignedIn]);

  // Continue the flow once the user picked a wallet in the modal.
  useEffect(() => {
    if (wallet.connected && pending.current) void sign();
  }, [wallet.connected, sign]);

  const signIn = useCallback(() => {
    if (wallet.connected) return sign();
    pending.current = true;
    modal.setVisible(true);
    return Promise.resolve();
  }, [wallet.connected, sign, modal]);

  return { signIn, busy, error, wallet };
}

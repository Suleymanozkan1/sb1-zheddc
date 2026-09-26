import type { AdminRole, MeDto } from "@cryptoarena/shared";
import { createContext, useContext } from "react";

export interface TokenMeta {
  decimals: number;
  symbol: string;
  network: string;
}

export interface Session {
  me: MeDto;
  role: AdminRole;
  token: TokenMeta;
  logout: () => void;
  openUser: (id: string) => void;
}

export const SessionCtx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useSession outside of SessionCtx");
  return s;
}

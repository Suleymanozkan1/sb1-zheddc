import { useEffect, useState } from "react";

export const SECTIONS = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "users", label: "Users", icon: "◉" },
  { id: "wallets", label: "Wallets", icon: "◎" },
  { id: "deposits", label: "Deposits", icon: "↓" },
  { id: "withdrawals", label: "Withdrawals", icon: "↑" },
  { id: "rewards", label: "Rewards", icon: "✦" },
  { id: "items", label: "Items", icon: "⚔" },
  { id: "characters", label: "Characters", icon: "♞" },
  { id: "shop", label: "Shop", icon: "▣" },
  { id: "purchases", label: "Purchases", icon: "▤" },
  { id: "seasons", label: "Seasons", icon: "◷" },
  { id: "leaderboards", label: "Leaderboards", icon: "▲" },
  { id: "rooms", label: "Game Rooms", icon: "⬡" },
  { id: "transactions", label: "Transactions", icon: "≡" },
  { id: "audit", label: "Audit Log", icon: "✎" },
  { id: "anticheat", label: "Anti-cheat", icon: "⚑" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export interface Route {
  section: SectionId;
  user: string | null;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  const section = (SECTIONS.find((s) => s.id === path)?.id ?? "overview") as SectionId;
  const user = new URLSearchParams(query).get("user");
  return { section, user };
}

export function href(r: Route): string {
  return `#/${r.section}${r.user ? `?user=${encodeURIComponent(r.user)}` : ""}`;
}

export function navigate(r: Route): void {
  window.location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

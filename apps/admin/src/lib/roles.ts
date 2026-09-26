import type { AdminRole } from "@cryptoarena/shared";

// Mirrors ROLE_RANK in packages/economy. UI-only: the server remains the authority.
export const ROLE_RANK: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };

export function hasRole(role: AdminRole | null | undefined, min: AdminRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export const ROLE_COLOR: Record<AdminRole, string> = {
  SUPER_ADMIN: "#f43f5e",
  ADMIN: "#e879f9",
  MODERATOR: "#fbbf24",
  SUPPORT: "#22d3ee",
};

// Period keys for daily / weekly / seasonal resets (all UTC).

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** ISO-8601 week key, e.g. "2026-W39". */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function startOfIsoWeek(d = new Date()): Date {
  const t = startOfUtcDay(d);
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t;
}

export function questPeriodKey(period: "DAILY" | "WEEKLY" | "SEASONAL" | "ACHIEVEMENT", seasonKey: string | null, d = new Date()): string {
  switch (period) {
    case "DAILY":
      return `D:${dayKey(d)}`;
    case "WEEKLY":
      return `W:${weekKey(d)}`;
    case "SEASONAL":
      return `S:${seasonKey ?? "none"}`;
    case "ACHIEVEMENT":
      return "A";
  }
}

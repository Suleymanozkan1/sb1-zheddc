import { RARITY_COLORS, formatUnits, type Rarity } from "@cryptoarena/shared";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black shadow-[0_0_24px_rgb(34_211_238/0.45)] hover:brightness-110",
  secondary: "bg-white/10 text-white border border-white/15 hover:bg-white/15",
  ghost: "bg-transparent text-cyan-200 hover:bg-white/5",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  success: "bg-lime-400 text-black hover:brightness-110",
};

const SIZES = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base", xl: "px-10 py-5 text-2xl" } as const;

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Panel({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx("glass p-4 md:p-5", className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-cyan-200">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function RarityBadge({ rarity, label }: { rarity: Rarity; label?: string }) {
  const color = RARITY_COLORS[rarity];
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color, border: `1px solid ${color}66`, background: `${color}14` }}>
      {label ?? rarity}
    </span>
  );
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
      <span className="font-display text-lg font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", small ? "h-3.5 w-3.5" : "h-6 w-6")} />;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="glass w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-cyan-200">{title}</h3>
          <button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">{children}</div>;
}

export function ProgressBar({ value, max, color = "#22d3ee", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
    </div>
  );
}

export function formatInt(v: string | number | bigint): string {
  const n = typeof v === "bigint" ? v : BigInt(typeof v === "number" ? Math.trunc(v) : v || "0");
  return n.toLocaleString("en-US");
}

export function formatToken(v: string | bigint, decimals: number, maxFraction = 4): string {
  return formatUnits(v, decimals, maxFraction);
}

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function Table({ columns, rows, empty = "Nothing here yet" }: { columns: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

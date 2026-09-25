import type { AdminRole } from "@cryptoarena/shared";
import { Button, Spinner, cx, shortAddress } from "@cryptoarena/ui";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { errorMessage } from "../lib/api";
import { json } from "../lib/format";
import { hasRole } from "../lib/roles";
import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";

const TONES = {
  cyan: "text-cyan-200 border-cyan-400/40 bg-cyan-400/10",
  lime: "text-lime-200 border-lime-400/40 bg-lime-400/10",
  amber: "text-amber-200 border-amber-400/40 bg-amber-400/10",
  red: "text-rose-200 border-rose-500/50 bg-rose-500/10",
  pink: "text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-400/10",
  slate: "text-slate-300 border-white/15 bg-white/5",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap uppercase", TONES[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "lime",
  RUNNING: "lime",
  COMPLETED: "lime",
  CREDITED: "lime",
  GRANTED: "lime",
  POSTED: "lime",
  CREDIT: "lime",
  SUSPENDED: "amber",
  PENDING: "amber",
  PROCESSING: "cyan",
  SUBMITTED: "cyan",
  AWAITING_SIGNATURE: "slate",
  WAITING: "cyan",
  UPCOMING: "cyan",
  CAPPED: "amber",
  REFUNDED: "pink",
  BANNED: "red",
  FAILED: "red",
  REJECTED: "red",
  CANCELLED: "slate",
  EXPIRED: "slate",
  ENDED: "slate",
  DEBIT: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{status.replace(/_/g, " ")}</Badge>;
}

/** Monospace, shortened identifier; click copies the full value. */
export function Mono({ value, short = true }: { value: string | null | undefined; short?: boolean }) {
  const toast = useToast();
  if (!value) return <span className="text-slate-500">—</span>;
  const shown = short ? (value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value) : value;
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      className="font-mono text-xs text-slate-300 hover:text-cyan-200"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => toast("info", "Copied to clipboard"));
      }}
    >
      {shown}
    </button>
  );
}

export function Addr({ value }: { value: string | null | undefined }) {
  const toast = useToast();
  if (!value) return <span className="text-slate-500">—</span>;
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      className="font-mono text-xs text-slate-300 hover:text-cyan-200"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => toast("info", "Copied to clipboard"));
      }}
    >
      {shortAddress(value)}
    </button>
  );
}

export function UserLink({ id, name }: { id: string | null | undefined; name?: string | null }) {
  const { openUser } = useSession();
  if (!id) return <span className="text-slate-500">—</span>;
  return (
    <button type="button" className="font-semibold text-cyan-300 hover:text-cyan-100 hover:underline" onClick={() => openUser(id)} title={id}>
      {name ?? `${id.slice(0, 8)}…`}
    </button>
  );
}

export function JsonCell({ value, label = "view" }: { value: unknown; label?: string }) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  if (typeof value === "object" && Object.keys(value).length === 0) return <span className="text-slate-500">{"{}"}</span>;
  return (
    <details className="max-w-[28rem]">
      <summary className="cursor-pointer text-xs text-cyan-300 select-none">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] leading-snug text-slate-300">{json(value)}</pre>
    </details>
  );
}

/** Button that is disabled when the signed-in admin's role is below `min`. */
export function RoleButton({ min, title, ...rest }: ComponentProps<typeof Button> & { min: AdminRole }) {
  const { role } = useSession();
  const allowed = hasRole(role, min);
  return <Button {...rest} disabled={rest.disabled || !allowed} title={allowed ? title : `Requires ${min.replace("_", " ")} role`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{children}</div>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center p-10 text-cyan-300">
      <Spinner />
    </div>
  );
}

/**
 * Confirmation modal for every admin mutation. Requires a reason (≥5 chars, matching the
 * server's `adminReason` schema), shows server error messages, and gates the confirm button
 * on the admin's role (the server still re-checks).
 */
type ActionModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: "primary" | "danger" | "success";
  min: AdminRole;
  /** Extra client-side validation of the form fields; return an error message or null. */
  validate?: () => string | null;
  onConfirm: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  children?: ReactNode;
};

export function ActionModal(props: ActionModalProps) {
  // Mounting the body only while open gives every opening a fresh reason/error state.
  return props.open ? <ActionModalBody {...props} /> : null;
}

function ActionModalBody({
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "primary",
  min,
  validate,
  onConfirm,
  onDone,
  children,
}: ActionModalProps) {
  const { role } = useSession();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const allowed = hasRole(role, min);
  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;
  const fieldError = validate?.() ?? null;

  const submit = async () => {
    if (!reasonOk || fieldError || !allowed) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      toast("success", typeof title === "string" ? `${title}: done` : "Action completed");
      onClose();
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && onClose()} role="dialog" aria-modal="true">
      <div className="glass max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-cyan-200">{title}</h3>
          <button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>
        {description && <div className="mb-4 text-sm text-slate-300">{description}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {children}
          <Field label="Reason (audited)" hint={`${reason.trim().length}/500 — at least 5 characters`}>
            <textarea className="field min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why are you doing this?" autoFocus />
          </Field>
          {fieldError && <p className="mb-3 text-xs text-amber-300">{fieldError}</p>}
          {!allowed && <p className="mb-3 text-xs text-amber-300">Your role ({role}) cannot perform this action — requires {min}.</p>}
          {error && (
            <div className="mb-3">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant={variant} loading={busy} disabled={!reasonOk || !!fieldError || !allowed}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

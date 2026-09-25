import { Button, Panel, Spinner, Table } from "@cryptoarena/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ListParams } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { ErrorBox } from "./common";

/**
 * How the endpoint pages:
 * - "server": honours limit + offset
 * - "limit": honours limit only (no offset) — show a "max rows" selector
 * - "none": returns everything — paginate client-side
 */
export type Paging = "server" | "limit" | "none";

export interface ListConfig<T> {
  title: string;
  fetch: (p: ListParams) => Promise<T[] | { total: number; rows: T[] }>;
  columns: string[];
  row: (r: T) => ReactNode[];
  paging: Paging;
  /** Server-side `q` search. When false and `localSearch` is set, search filters loaded rows. */
  serverSearch?: boolean;
  searchPlaceholder?: string;
  localSearch?: (r: T, q: string) => boolean;
  statuses?: readonly string[];
  defaultStatus?: string;
  /** Label for the empty status option (default "All statuses"). */
  allStatusLabel?: string;
  actions?: ReactNode;
  note?: ReactNode;
  empty?: string;
  /** Changing this value forces a refetch (e.g. after an action). */
  refreshKey?: number;
}

const PAGE_SIZES = [25, 50, 100, 200] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ListView<T>(cfg: ListConfig<T>) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(cfg.defaultStatus ?? "");
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState(0);
  const q = useDebounced(search.trim(), 350);
  const hasSearch = cfg.serverSearch || !!cfg.localSearch;

  // Reset to the first page whenever the filter changes.
  const filterKey = `${q}|${status}|${limit}`;
  const [lastFilter, setLastFilter] = useState(filterKey);
  if (lastFilter !== filterKey) {
    setLastFilter(filterKey);
    setPage(0);
  }

  const params: ListParams = {
    ...(cfg.serverSearch && q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(cfg.paging !== "none" ? { limit } : {}),
    ...(cfg.paging === "server" ? { offset: page * limit } : {}),
  };
  const key = JSON.stringify(params) + `#${cfg.refreshKey ?? 0}`;
  const { data, error, loading, reload } = useAsync(() => cfg.fetch(params), key);

  const { rows, total } = useMemo(() => {
    if (!data) return { rows: [] as T[], total: null as number | null };
    if (Array.isArray(data)) return { rows: data, total: null };
    return { rows: data.rows, total: data.total };
  }, [data]);

  const filtered = useMemo(() => {
    if (cfg.serverSearch || !cfg.localSearch || !q) return rows;
    const needle = q.toLowerCase();
    const fn = cfg.localSearch;
    return rows.filter((r) => fn(r, needle));
  }, [rows, q, cfg.serverSearch, cfg.localSearch]);

  const visible = cfg.paging === "none" ? filtered.slice(page * limit, page * limit + limit) : filtered;
  const clientTotal = cfg.paging === "none" ? filtered.length : null;
  const shownTotal = total ?? clientTotal;
  const hasNext =
    cfg.paging === "server" ? (total !== null ? (page + 1) * limit < total : rows.length === limit) : cfg.paging === "none" ? (page + 1) * limit < filtered.length : false;
  const from = rows.length === 0 ? 0 : page * limit + 1;
  const to = page * limit + visible.length;

  return (
    <Panel
      title={cfg.title}
      actions={
        <div className="flex items-center gap-2">
          {cfg.actions}
          <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={loading} title="Reload">
            {loading ? <Spinner small /> : "↻"}
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {hasSearch && (
          <input
            className="field sm:max-w-xs"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={cfg.searchPlaceholder ?? (cfg.serverSearch ? "Search…" : "Filter loaded rows…")}
            aria-label="Search"
          />
        )}
        {cfg.statuses && (
          <select className="field sm:max-w-[13rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="">{cfg.allStatusLabel ?? "All statuses"}</option>
            {cfg.statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}
        <select className="field sm:max-w-[9rem]" value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {cfg.paging === "limit" ? `max ${n}` : `${n} / page`}
            </option>
          ))}
        </select>
        {cfg.note && <span className="text-xs text-slate-500">{cfg.note}</span>}
      </div>

      {error && (
        <div className="mb-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {loading && !data ? (
        <div className="flex justify-center p-8 text-cyan-300">
          <Spinner />
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          <Table columns={cfg.columns} rows={visible.map(cfg.row)} empty={cfg.empty ?? "No rows match"} />
        </div>
      )}

      {cfg.paging !== "limit" && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            {visible.length > 0 ? `${from}–${to}` : "0"}
            {shownTotal !== null ? ` of ${shownTotal}` : ""}
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
              ← Prev
            </Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || loading}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

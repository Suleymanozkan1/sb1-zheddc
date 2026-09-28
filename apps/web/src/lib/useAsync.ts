import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./store";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  // Only the latest call may update state, so a slow earlier response cannot overwrite a newer one.
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const v = await run();
      if (mine === seq.current) {
        setData(v);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}

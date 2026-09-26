import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

/** Runs `fn` whenever `key` changes (and on `reload()`), ignoring stale responses. */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (mine === seq.current) {
        setData(v);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [key, reload]);

  return { data, error, loading, reload };
}

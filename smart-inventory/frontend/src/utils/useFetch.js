import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Loads data from the API and exposes { data, meta, loading, error, reload }.
// Pass a null path to skip the request. Re-runs automatically when `path` or `params` change. Stale responses are ignored.
export function useFetch(path, params) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const counter = useRef(0);
  const key = JSON.stringify([path, params]);

  const load = useCallback(async () => {
    if (!path) { setState({ data: null, meta: null, loading: false, error: null }); return; }   // path null = skip
    const id = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.get(path, params);
      if (id === counter.current) setState({ data: res.data, meta: res.meta || null, loading: false, error: null });
    } catch (e) {
      if (id === counter.current) setState({ data: null, meta: null, loading: false, error: e.message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

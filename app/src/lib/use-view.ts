'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

type ViewState<T> = { key: string; data?: T; error?: string };

/** Runs a view call, optionally re-polling every `refreshMs`. A new `key` starts fresh (old data is not shown). */
export function useView<T>(load: () => Promise<T>, key: string, refreshMs = 0) {
  const [state, setState] = useState<ViewState<T>>({ key });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const refresh = useCallback(async () => {
    try {
      const data = await loadRef.current();
      // As a transition, the re-render when results arrive is split into small slices instead of one long blocking
      // task (a plain setState after an await renders in one go; on the machine page that froze phones ~0.4-1.5 s).
      startTransition(() => setState({ key, data }));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      startTransition(() => setState((s) => ({ key, data: s.key === key ? s.data : undefined, error })));
    }
  }, [key]);

  useEffect(() => {
    void refresh();
    if (!refreshMs) return;
    const t = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(t);
  }, [refresh, refreshMs]);

  const current = state.key === key ? state : { key };
  return { data: current.data, error: current.error, refresh };
}

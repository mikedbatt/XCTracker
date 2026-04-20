// ── Stale-while-revalidate loader hook ───────────────────────────────────────
// Orchestrates data loading so that:
//   - First load (no cached data): `loading` is true → screen shows spinner
//   - Subsequent loads (data already in memory): `loading` stays false,
//     `refreshing` goes true → screen keeps showing the previous data and
//     silently refreshes in the background.
//
// Screens pass a `loadFn` that fetches data and writes it into their own
// state. This hook only owns the load/refresh flags — not the data.
//
// Usage:
//   const loadDashboard = useCallback(async () => {
//     // fetch + setAthleteMiles(...), setGroups(...), etc.
//   }, [schoolId, selectedTimeframe]);
//
//   const { loading, refreshing, refresh } = useStaleRefresh(
//     loadDashboard,
//     [schoolId, selectedTimeframe]
//   );
//
//   if (loading) return <Spinner />;
//   return <Dashboard />;

import { useCallback, useEffect, useRef, useState } from 'react';

export function useStaleRefresh(loadFn, deps = []) {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef                = useRef(false);

  const run = useCallback(async () => {
    if (hasLoadedRef.current) setRefreshing(true);
    else                      setLoading(true);
    try {
      await loadFn();
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadFn]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);

  return { loading, refreshing, refresh: run };
}

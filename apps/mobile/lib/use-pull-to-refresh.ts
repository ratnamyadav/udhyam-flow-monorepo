import { useState } from 'react';

// RefreshControl state for the user's own pull only. Driving it from a
// query's isRefetching also shows it for background refetches (e.g. after a
// change on another screen), and iOS can leave the indicator stuck when it
// toggles while the screen is off-screen in a stack.
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      void refresh().finally(() => setRefreshing(false));
    },
  };
}

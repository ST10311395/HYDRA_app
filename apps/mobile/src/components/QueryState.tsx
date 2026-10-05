import { ApiError, errorMessage } from '../api/client';
import { Button, EmptyState, ErrorState, LoadingCards } from '../design-system';

/** The fields every TanStack query/infinite-query result has. */
export interface QueryLike {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  error: unknown;
  refetch: () => unknown;
}

export type ViewState = 'loading' | 'offline' | 'forbidden' | 'error' | 'ready';

/**
 * One reading of a query for the UI. A query paused because the device is offline is *pending*
 * but neither loading nor errored — screens that only checked `isLoading`/`isError` fell through
 * to their empty state ("No customers yet") or kept showing skeletons. This makes it explicit.
 */
export function viewState(q: QueryLike): ViewState {
  if (q.status === 'pending') return q.fetchStatus === 'paused' ? 'offline' : 'loading';
  if (q.status === 'error') {
    if (q.error instanceof ApiError && q.error.status === 403) return 'forbidden';
    if (q.error instanceof ApiError && q.error.code === 'NETWORK') return 'offline';
    return 'error';
  }
  return 'ready';
}

/**
 * Renders the non-data state of a query: skeleton while loading, then an explicit offline,
 * permission-denied or error card (with the server's reason and Retry). Skeletons never outlive
 * the request. When the query succeeded but the record is missing it says so.
 */
export function QueryFallback({ query, count = 3 }: { query: QueryLike; count?: number }) {
  const retry = () => void query.refetch();
  switch (viewState(query)) {
    case 'loading':
      return <LoadingCards count={count} />;
    case 'offline':
      return (
        <EmptyState
          icon="wifi-off"
          title="You’re offline"
          message="This will load when your connection returns. Nothing you have typed elsewhere is lost."
          action={<Button label="Try again" icon="refresh-cw" variant="secondary" fullWidth={false} onPress={retry} />}
        />
      );
    case 'forbidden':
      return <EmptyState icon="lock" title="No access" message={errorMessage(query.error)} />;
    case 'error':
      return <ErrorState message={errorMessage(query.error)} onRetry={retry} />;
    default:
      return <ErrorState message="This record is no longer available." onRetry={retry} />;
  }
}

/** True while there is nothing to show yet: loading, offline, or failed without cached data. */
export const notReady = (q: QueryLike & { data?: unknown }): boolean => q.status === 'pending' || (q.status === 'error' && q.data === undefined);

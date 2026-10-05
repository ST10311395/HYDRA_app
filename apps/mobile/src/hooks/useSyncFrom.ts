import { useState } from 'react';

const UNSET = Symbol('unset');

/**
 * Runs `apply(value)` during render whenever `value` changes (by identity), including the first
 * non-null value. This is React's recommended way to reset or seed local state from props, route
 * params or freshly loaded server data ("adjusting state when a prop changes") — it avoids the extra
 * render pass and flicker of doing the same thing in a `useEffect`.
 *
 * Pass a stable key (e.g. an id) instead of an object when the state should be seeded only once.
 */
export function useSyncFrom<T>(value: T | undefined | null, apply: (value: T) => void): void {
  const [seen, setSeen] = useState<unknown>(UNSET);
  if (value !== undefined && value !== null && !Object.is(value, seen)) {
    setSeen(value);
    apply(value);
  }
}

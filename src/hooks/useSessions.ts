import { useCallback, useSyncExternalStore } from 'react';
import { sessionRepository } from '../persistence/repository';
import type { StoredSession } from '../persistence/types';

/**
 * Read-only view of persisted sessions plus mutation helpers. Components never
 * touch localStorage directly — everything goes through the repository.
 */
export function useSessions() {
  const subscribe = useCallback((cb: () => void) => sessionRepository.subscribe(cb), []);
  // The repository returns a stable array reference until a mutation occurs,
  // which is what useSyncExternalStore requires.
  const sessions = useSyncExternalStore(
    subscribe,
    () => sessionRepository.list(),
    () => sessionRepository.list(),
  );

  const remove = useCallback((id: string) => sessionRepository.delete(id), []);
  const clearAll = useCallback(() => sessionRepository.clearAll(), []);
  const get = useCallback((id: string): StoredSession | null => sessionRepository.get(id), []);

  return { sessions, remove, clearAll, get };
}

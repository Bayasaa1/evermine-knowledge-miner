import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './use-auth';
import { architectStateKey, EMPTY_ARCHITECT_STATE, mergeArchitectState, normalizeArchitectState, type ArchitectState } from '@/lib/architect-state';
const EVENT = 'evermind:architect-state-changed';
const cache = new Map<string, ArchitectState>();
function read(owner: string): ArchitectState {
  try {
    const raw = localStorage.getItem(architectStateKey(owner));
    const state = raw ? normalizeArchitectState(JSON.parse(raw)) : normalizeArchitectState({
      operatorId: localStorage.getItem(`evermind:operator-mind:${owner}`),
      rosterIds: JSON.parse(localStorage.getItem(`evermind:architect-roster:${owner}`) || '[]'),
    });
    cache.set(owner, state);
    if (!raw) { localStorage.setItem(architectStateKey(owner), JSON.stringify(state)); localStorage.removeItem(`evermind:operator-mind:${owner}`); localStorage.removeItem(`evermind:architect-roster:${owner}`); }
    return state;
  } catch { return cache.get(owner) ?? EMPTY_ARCHITECT_STATE; }
}
export function useArchitectState() {
  const { userId } = useAuth();
  const [state, setState] = useState<{ owner: string | null; value: ArchitectState }>({ owner: null, value: EMPTY_ARCHITECT_STATE });
  useEffect(() => {
    if (!userId) { cache.clear(); setState({ owner: null, value: EMPTY_ARCHITECT_STATE }); return; }
    const sync = () => setState({ owner: userId, value: read(userId) });
    sync(); window.addEventListener(EVENT, sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, [userId]);
  const change = useCallback((patch: Partial<ArchitectState>) => {
    if (!userId) return;
    const value = mergeArchitectState(read(userId), patch); cache.set(userId, value);
    try { localStorage.setItem(architectStateKey(userId), JSON.stringify(value)); } catch { /* retain memory state */ }
    setState({ owner: userId, value }); window.dispatchEvent(new Event(EVENT));
  }, [userId]);
  return { ...(state.owner === userId ? state.value : EMPTY_ARCHITECT_STATE), change };
}

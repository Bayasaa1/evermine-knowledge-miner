import { normalizeOperatorMind } from './operator-mind';
import { normalizeMindRoster } from './mind-directives';
export type ArchitectState = { operatorId: string; rosterIds: string[] };
export const EMPTY_ARCHITECT_STATE: ArchitectState = { operatorId: 'builtin:architect', rosterIds: [] };
export const architectStateKey = (owner: string) => `evermind:architect-state:${owner}`;
export function normalizeArchitectState(value: unknown): ArchitectState {
  const state = value && typeof value === 'object' ? value as Partial<ArchitectState> : {};
  return { operatorId: normalizeOperatorMind(state.operatorId), rosterIds: normalizeMindRoster(state.rosterIds) };
}
export function mergeArchitectState(current: ArchitectState, patch: Partial<ArchitectState>): ArchitectState {
  return normalizeArchitectState({ ...current, ...patch });
}

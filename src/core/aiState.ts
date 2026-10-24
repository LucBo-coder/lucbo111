// Explicit combat state machine labels for every fighting unit (allies, wild, trainer Pokémon).
// The world derives the state each tick from the unit's situation; `nextAiState` adds hysteresis so
// the voluntary states (chase / position / follow / idle) can't flip back and forth every frame.

export type AiState =
  | 'idle' | 'follow' | 'search' | 'chase' | 'position' | 'attack' | 'cast'
  | 'dodge' | 'recover' | 'stunned' | 'flee' | 'fainted';

export const AI_STATES: readonly AiState[] = ['idle', 'follow', 'search', 'chase', 'position', 'attack', 'cast', 'dodge', 'recover', 'stunned', 'flee', 'fainted'];

/** States entered because something happened to the unit — they always apply immediately. */
const FORCED: ReadonlySet<AiState> = new Set(['cast', 'dodge', 'stunned', 'fainted', 'flee', 'recover', 'attack']);
/** Minimum time (s) in a voluntary state before switching to another voluntary state. */
export const AI_MIN_DWELL = 0.3;

export interface AiStateHolder {
  aiState: AiState;
  aiStateT: number;
}

/**
 * Applies a desired state with hysteresis. Returns true when the state changed.
 * Forced states (cast, dodge, stunned, fainted…) switch instantly; voluntary ones wait AI_MIN_DWELL.
 */
export function nextAiState(u: AiStateHolder, want: AiState, dt: number): boolean {
  u.aiStateT += dt;
  if (want === u.aiState) return false;
  if (!FORCED.has(want) && !FORCED.has(u.aiState) && u.aiStateT < AI_MIN_DWELL) return false;
  u.aiState = want;
  u.aiStateT = 0;
  return true;
}

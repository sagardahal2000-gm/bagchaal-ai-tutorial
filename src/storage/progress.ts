import AsyncStorage from '@react-native-async-storage/async-storage';

import { RatedPuzzle, RatedUser } from '../engine/elo';

/**
 * Local progress store.
 *
 * All progress stays on the device: no account, no network, no
 * identifiers. The key carries a version so that a later schema change
 * can be detected and discarded rather than crashing on load.
 */

const KEY = 'bagchaal:progress:v1';

export interface Progress {
  user: RatedUser;
  ratings: RatedPuzzle[];
  solvedIds: string[];
}

/** Storage is untrusted input: it may be absent, truncated or from an
 *  older build, so every field is checked before it is used. */
function isProgress(value: unknown): value is Progress {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Progress>;

  const userOk =
    typeof candidate.user === 'object' &&
    candidate.user !== null &&
    typeof candidate.user.rating === 'number' &&
    Number.isFinite(candidate.user.rating) &&
    typeof candidate.user.attempts === 'number';

  const ratingsOk =
    Array.isArray(candidate.ratings) &&
    candidate.ratings.every(
      (entry) =>
        typeof entry?.id === 'string' &&
        typeof entry?.rating === 'number' &&
        Number.isFinite(entry.rating) &&
        typeof entry?.attempts === 'number',
    );

  const solvedOk =
    Array.isArray(candidate.solvedIds) &&
    candidate.solvedIds.every((id) => typeof id === 'string');

  return userOk && ratingsOk && solvedOk;
}

export async function loadProgress(): Promise<Progress | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : null;
  } catch {
    // A read failure means starting fresh, which is recoverable. It must
    // never take the screen down.
    return null;
  }
}

export async function saveProgress(progress: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Ignored deliberately: losing a rating update is not worth an error
    // dialog mid-puzzle.
  }
}

export async function clearProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do if the delete fails.
  }
}

/**
 * Reconcile stored ratings with the authored puzzle set.
 *
 * Stored entries win where the ids match, so learned difficulty
 * survives. Puzzles added since the last save appear at their authored
 * seed, and puzzles since removed are dropped — without this, adding a
 * puzzle would leave it invisible to selectPuzzle forever.
 */
export function mergeRatings(
  seeded: RatedPuzzle[],
  stored: RatedPuzzle[],
): RatedPuzzle[] {
  const byId = new Map(stored.map((entry) => [entry.id, entry]));
  return seeded.map((seed) => byId.get(seed.id) ?? seed);
}

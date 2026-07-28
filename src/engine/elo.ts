/**
 * Elo-style skill estimation for adaptive puzzle difficulty.
 *
 * Both the user and each puzzle hold a rating. After every attempt the
 * two are updated against each other exactly as two players would be:
 * solving a hard puzzle raises the user's rating and lowers the
 * puzzle's, and failing an easy one does the reverse. Difficulty
 * therefore tracks the individual learner and is calibrated by real
 * outcomes, rather than by fixed tiers.
 *
 * The provisional period addresses risk 4 in the proposal: a new user's
 * rating is close to meaningless, so early attempts move it further.
 */

/** Everyone and every puzzle starts here. The absolute value is
 *  arbitrary; only differences between ratings affect anything. */
export const DEFAULT_RATING = 1000;

/** Steady-state update step. */
export const K_FACTOR = 24;

/** Larger step while a rating is still provisional, so a new user
 *  reaches roughly the right level in a handful of attempts. */
export const PROVISIONAL_K = 64;

/** Attempts before a user's rating is treated as settled. */
export const PROVISIONAL_ATTEMPTS = 5;

/** Ratings are clamped to this range to stop runaway drift from a long
 *  streak either way. */
export const MIN_RATING = 400;
export const MAX_RATING = 2400;

/** Difficulty is aimed at the band where the user solves about 70% —
 *  hard enough to be worth doing, easy enough to stay motivating. */
export const TARGET_SOLVE_PROBABILITY = 0.7;

export interface RatedUser {
  rating: number;
  attempts: number;
}

export interface RatedPuzzle {
  id: string;
  rating: number;
  attempts: number;
}

export function newUser(rating: number = DEFAULT_RATING): RatedUser {
  return { rating, attempts: 0 };
}

function clamp(rating: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, rating));
}

/**
 * Probability that a player of `rating` solves a puzzle of
 * `puzzleRating`. The standard logistic curve: equal ratings give 0.5,
 * and a 400-point edge gives roughly 0.91.
 */
export function expectedScore(rating: number, puzzleRating: number): number {
  return 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400));
}

function kFor(attempts: number): number {
  return attempts < PROVISIONAL_ATTEMPTS ? PROVISIONAL_K : K_FACTOR;
}

export interface AttemptResult {
  user: RatedUser;
  puzzle: RatedPuzzle;
  /** What the user's rating moved by. Useful to show in the UI. */
  userDelta: number;
  expected: number;
}

/**
 * Apply one attempt. `score` is 1 for a solve, 0 for a failure, and may
 * be anything between — 0.5 for a solve that needed a hint, say.
 *
 * Returns new objects rather than mutating, so callers can diff the
 * before and after for display, and so persisted state is never
 * modified in place.
 */
export function recordAttempt(
  user: RatedUser,
  puzzle: RatedPuzzle,
  score: number,
): AttemptResult {
  const clampedScore = Math.min(1, Math.max(0, score));
  const expected = expectedScore(user.rating, puzzle.rating);

  const userK = kFor(user.attempts);
  const puzzleK = kFor(puzzle.attempts);

  const userDelta = userK * (clampedScore - expected);
  // The puzzle's result is the mirror image of the user's, so its
  // update is the same expression with both terms negated.
  const puzzleDelta = puzzleK * (expected - clampedScore);

  return {
    user: {
      rating: clamp(user.rating + userDelta),
      attempts: user.attempts + 1,
    },
    puzzle: {
      ...puzzle,
      rating: clamp(puzzle.rating + puzzleDelta),
      attempts: puzzle.attempts + 1,
    },
    userDelta,
    expected,
  };
}

/**
 * Pick the puzzle whose predicted solve probability sits closest to the
 * target. `exclude` holds ids already solved, so the same puzzle is not
 * served twice; if everything is excluded the filter is ignored rather
 * than returning nothing.
 */
export function selectPuzzle(
  user: RatedUser,
  puzzles: RatedPuzzle[],
  exclude: ReadonlySet<string> = new Set(),
  target: number = TARGET_SOLVE_PROBABILITY,
): RatedPuzzle | null {
  if (puzzles.length === 0) return null;

  const available = puzzles.filter((p) => !exclude.has(p.id));
  const pool = available.length > 0 ? available : puzzles;

  let best = pool[0];
  let bestDistance = Infinity;
  for (const puzzle of pool) {
    const distance = Math.abs(expectedScore(user.rating, puzzle.rating) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = puzzle;
    }
  }
  return best;
}
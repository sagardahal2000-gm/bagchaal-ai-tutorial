import {
    DEFAULT_RATING,
    expectedScore,
    K_FACTOR,
    MAX_RATING,
    MIN_RATING,
    newUser,
    PROVISIONAL_ATTEMPTS,
    PROVISIONAL_K,
    RatedPuzzle,
    recordAttempt, selectPuzzle,
} from '../elo';

const puzzle = (id: string, rating: number, attempts = 99): RatedPuzzle =>
  ({ id, rating, attempts });

describe('expectedScore', () => {
  it('gives even odds between equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
  });

  it('gives roughly 0.91 to a player 400 points ahead', () => {
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 2);
  });

  it('is symmetric: the two sides sum to one', () => {
    expect(expectedScore(1200, 900) + expectedScore(900, 1200)).toBeCloseTo(1, 10);
  });
});

describe('recordAttempt', () => {
  it('raises the user rating on a solve and lowers the puzzle rating', () => {
    const before = { rating: 1000, attempts: 99 };
    const result = recordAttempt(before, puzzle('p', 1000), 1);

    expect(result.user.rating).toBeGreaterThan(before.rating);
    expect(result.puzzle.rating).toBeLessThan(1000);
  });

  it('moves the rating further on an upset than on an expected result', () => {
    const user = { rating: 1000, attempts: 99 };
    const expectedWin = recordAttempt(user, puzzle('easy', 600), 1);
    const upsetWin = recordAttempt(user, puzzle('hard', 1400), 1);

    expect(upsetWin.userDelta).toBeGreaterThan(expectedWin.userDelta);
  });

  it('does not mutate its inputs', () => {
    const user = newUser();
    const target = puzzle('p', 1000);
    recordAttempt(user, target, 1);

    expect(user).toEqual({ rating: DEFAULT_RATING, attempts: 0 });
    expect(target.rating).toBe(1000);
  });

  it('uses the larger step while the user is provisional', () => {
    const provisional = recordAttempt({ rating: 1000, attempts: 0 }, puzzle('p', 1000), 1);
    const settled = recordAttempt(
      { rating: 1000, attempts: PROVISIONAL_ATTEMPTS }, puzzle('p', 1000), 1,
    );

    expect(provisional.userDelta).toBeCloseTo(PROVISIONAL_K * 0.5, 6);
    expect(settled.userDelta).toBeCloseTo(K_FACTOR * 0.5, 6);
    expect(provisional.userDelta).toBeGreaterThan(settled.userDelta);
  });

  it('accepts partial credit between a solve and a failure', () => {
    const user = { rating: 1000, attempts: 99 };
    const half = recordAttempt(user, puzzle('p', 1000), 0.5);
    expect(half.userDelta).toBeCloseTo(0, 6);
  });

  it('clamps ratings to the permitted range', () => {
    let user = { rating: MAX_RATING, attempts: 99 };
    for (let i = 0; i < 50; i++) user = recordAttempt(user, puzzle('p', 400), 1).user;
    expect(user.rating).toBeLessThanOrEqual(MAX_RATING);

    let weak = { rating: MIN_RATING, attempts: 99 };
    for (let i = 0; i < 50; i++) weak = recordAttempt(weak, puzzle('p', 2400), 0).user;
    expect(weak.rating).toBeGreaterThanOrEqual(MIN_RATING);
  });
});

describe('selectPuzzle', () => {
  it('picks the puzzle nearest the target solve probability', () => {
    const user = { rating: 1000, attempts: 99 };
    const pool = [puzzle('trivial', 400), puzzle('fitting', 850), puzzle('brutal', 1800)];

    // A 70% target sits a little below the user's own rating.
    expect(selectPuzzle(user, pool)?.id).toBe('fitting');
  });

  it('skips puzzles already solved', () => {
    const user = { rating: 1000, attempts: 99 };
    const pool = [puzzle('fitting', 850), puzzle('next', 900)];

    expect(selectPuzzle(user, pool, new Set(['fitting']))?.id).toBe('next');
  });

  it('falls back to the full pool once everything is excluded', () => {
    const user = { rating: 1000, attempts: 99 };
    const pool = [puzzle('only', 850)];

    expect(selectPuzzle(user, pool, new Set(['only']))?.id).toBe('only');
  });

  it('returns null for an empty pool', () => {
    expect(selectPuzzle(newUser(), [])).toBeNull();
  });
});
import { GOAT, POINTS, TIGER } from '../board';
import {
    WIN_SCORE, Weights,
    countGoatSupport,
    countGoatsEnPrise,
    evaluate, evaluateForSideToMove,
    scoreForTigers,
    tigerSpread
} from '../evaluate';
import { GameState, applyMove, generateMoves, initialState } from '../moves';

/** All features neutralised, so a single one can be isolated. */
const ZERO_WEIGHTS: Weights = {
  goatCaptured: 0,
  tigerTrapped: 0,
  tigerMobility: 0,
  goatEnPrise: 0,
  goatSupport: 0,
  tigerSpread: 0,
};

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function position(
  tigers: number[],
  goats: number[],
  overrides: Partial<GameState> = {},
): GameState {
  const board = new Int8Array(POINTS);
  for (const t of tigers) board[t] = TIGER;
  for (const g of goats) board[g] = GOAT;
  return {
    board,
    turn: TIGER,
    goatsPlaced: goats.length,
    goatsCaptured: 0,
    ...overrides,
  };
}

/** Same weights with one feature isolated, for directional tests. */
function only(feature: keyof Weights, value: number): Weights {
  return { ...ZERO_WEIGHTS, [feature]: value };
}

describe('feature extraction', () => {
  it('finds no goats en prise at the start', () => {
    expect(countGoatsEnPrise(initialState())).toBe(0);
  });

  it('counts a goat as en prise when a tiger can jump it', () => {
    // Tiger on 0, goat on 1, landing point 2 empty.
    expect(countGoatsEnPrise(position([0], [1]))).toBe(1);
  });

  it('does not count a goat whose landing point is blocked', () => {
    expect(countGoatsEnPrise(position([0], [1, 2]))).toBe(0);
  });

  it('counts each adjacent goat pair exactly once', () => {
    // Points 0, 1 and 2 lie on one edge line: pairs are 0-1 and 1-2.
    expect(countGoatSupport(position([], [0, 1, 2]))).toBe(2);
  });

  it('gives isolated goats no support', () => {
    expect(countGoatSupport(position([], [0, 4, 20, 24]))).toBe(0);
  });

  it('measures tiger spread as maximal on the corners', () => {
    const corners = tigerSpread(initialState());
    const clustered = tigerSpread(position([...[0, 1, 5, 6]], []));
    expect(corners).toBe(32);
    expect(clustered).toBeLessThan(corners);
  });
});

describe('perspective', () => {
  it('scores the two sides as exact negations', () => {
    const state = position([0, 4, 20, 24], [1, 2, 3, 7]);
    expect(evaluate(state, GOAT)).toBe(-evaluate(state, TIGER));
  });

  it('follows the side to move', () => {
    const state = position([0, 4, 20, 24], [1, 2, 3, 7], { turn: TIGER });
    expect(evaluateForSideToMove(state)).toBe(evaluate(state, TIGER));
    state.turn = GOAT;
    expect(evaluateForSideToMove(state)).toBe(evaluate(state, GOAT));
  });
});

describe('each feature moves the score the right way', () => {
  it('rewards tigers for captured goats', () => {
    const before = initialState();
    const after = initialState();
    after.goatsCaptured = 1;
    expect(scoreForTigers(after)).toBeGreaterThan(scoreForTigers(before));
  });

  it('penalises tigers for being trapped', () => {
    // Tiger on corner 0, boxed by goats on all three of its neighbours.
    const trapped = position([0], [1, 5, 6, 2, 10, 12], { goatsCaptured: 0 });
    const w = only('tigerTrapped', 60);
    expect(scoreForTigers(trapped, w)).toBeLessThan(0);
  });

  it('rewards tigers for threatening goats', () => {
    const threatening = position([0], [1]);
    const quiet = position([0], [12]);
    const w = only('goatEnPrise', 15);
    expect(scoreForTigers(threatening, w)).toBeGreaterThan(scoreForTigers(quiet, w));
  });

  it('rewards goats for connected formation', () => {
    const connected = position([], [0, 1, 2]);
    const scattered = position([], [0, 4, 20]);
    const w = only('goatSupport', 2);
    // Goat-positive means tiger-negative.
    expect(scoreForTigers(connected, w)).toBeLessThan(scoreForTigers(scattered, w));
  });

  it('rewards tigers for mobility', () => {
    const open = position([12], []);
    // Goats on the four orthogonal neighbours AND on the points behind
    // them, so the tiger can neither slide there nor jump. Blocking only
    // the neighbours would simply convert four slides into four captures.
    const hemmed = position([12], [7, 11, 13, 17, 2, 10, 14, 22]);
    const w = only('tigerMobility', 2);
    expect(scoreForTigers(open, w)).toBeGreaterThan(scoreForTigers(hemmed, w));
  });

  it('is not fooled by goats that only offer themselves for capture', () => {
    // Four goats adjacent to the centre tiger with empty landings behind:
    // four slides become four jumps, so mobility is unchanged.
    const w = only('tigerMobility', 2);
    expect(scoreForTigers(position([12], [7, 11, 13, 17]), w))
      .toBe(scoreForTigers(position([12], []), w));
  });
});

describe('weights are tunable', () => {
  it('scales a feature contribution linearly with its weight', () => {
    const state = initialState();
    state.goatsCaptured = 2;
    const single = scoreForTigers(state, only('goatCaptured', 100));
    const double = scoreForTigers(state, only('goatCaptured', 200));
    expect(single).toBe(200);
    expect(double).toBe(400);
  });

 it('produces a zero score when every weight is zero', () => {
    expect(scoreForTigers(initialState(), ZERO_WEIGHTS)).toBe(0);
  });
});

describe('heuristic bounds', () => {
  it('stays far below the mate score across a random game', () => {
    const rng = makeRng(7777);
    const state = initialState();

    for (let ply = 0; ply < 200; ply++) {
      const moves = generateMoves(state);
      if (moves.length === 0) break;
      applyMove(state, moves[Math.floor(rng() * moves.length)]);

      // A forced win must always outrank any material advantage.
      expect(Math.abs(scoreForTigers(state))).toBeLessThan(WIN_SCORE / 10);
    }
  });
});
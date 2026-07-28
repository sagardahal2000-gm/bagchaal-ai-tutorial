import { GOAT, GOATS_TO_LOSE, POINTS, TIGER, TIGER_START, TOTAL_GOATS } from '../board';
import {
    applyMove,
    GameState,
    generateMoves,
    initialState,
    inPlacementPhase,
} from '../moves';
import {
    countTrappedTigers,
    isTerminal,
    outcome,
    tigerIsTrapped,
    tigersImmobilised,
} from '../rules';

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a position from an explicit piece map. */
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
    goatsPlaced: TOTAL_GOATS,
    goatsCaptured: TOTAL_GOATS - goats.length,
    ...overrides,
  };
}

/**
 * Every tiger boxed in: all corner neighbours occupied and every jump
 * landing blocked. 17 goats, empty only at the odd-parity inner points.
 */
const TIGERS_ALL_TRAPPED = () =>
  position(
    [...TIGER_START],
    [1, 2, 3, 5, 6, 8, 9, 10, 12, 14, 15, 16, 18, 19, 21, 22, 23],
    { turn: TIGER, goatsPlaced: TOTAL_GOATS, goatsCaptured: 3 },
  );

describe('ongoing positions', () => {
  it('reports the initial position as ongoing', () => {
    const state = initialState();
    expect(outcome(state)).toBe('ongoing');
    expect(isTerminal(state)).toBe(false);
  });

  it('reports no trapped tigers at the start', () => {
    expect(countTrappedTigers(initialState())).toBe(0);
    expect(tigersImmobilised(initialState())).toBe(false);
  });
});

describe('tigers win by capture', () => {
  it('declares a tiger win once five goats are captured', () => {
    const state = initialState();
    state.goatsCaptured = GOATS_TO_LOSE;
    expect(outcome(state)).toBe('tigers-win');
  });

  it('checks the capture count before the move count', () => {
    // Goats to move with moves available, but five already lost.
    const state = initialState();
    state.goatsCaptured = GOATS_TO_LOSE;
    expect(generateMoves(state).length).toBeGreaterThan(0);
    expect(outcome(state)).toBe('tigers-win');
  });

  it('is still ongoing at four captures', () => {
    const state = initialState();
    state.goatsCaptured = GOATS_TO_LOSE - 1;
    expect(outcome(state)).toBe('ongoing');
  });
});

describe('goats win by immobilisation', () => {
  it('counts all four tigers as trapped in the boxed-in position', () => {
    const state = TIGERS_ALL_TRAPPED();
    expect(countTrappedTigers(state)).toBe(4);
    expect(tigersImmobilised(state)).toBe(true);
    for (const corner of TIGER_START) expect(tigerIsTrapped(state, corner)).toBe(true);
  });

  it('declares a goat win when Tigers is to move and cannot', () => {
    expect(outcome(TIGERS_ALL_TRAPPED())).toBe('goats-win');
  });

  it('is still ongoing in the same position when Goats is to move', () => {
    // A goat slide may yet open a line and free a tiger, so the game is
    // not decided until Tigers is actually to move.
    const state = TIGERS_ALL_TRAPPED();
    state.turn = GOAT;
    expect(outcome(state)).toBe('ongoing');
  });

  it('does not consider a tiger trapped when only a jump is available', () => {
    // Tiger on 0 is fully surrounded but may jump the goat on 1 onto 2.
    const state = position([0], [1, 5, 6, 10, 12], { turn: TIGER, goatsCaptured: 0 });
    expect(tigerIsTrapped(state, 0)).toBe(false);
    expect(tigersImmobilised(state)).toBe(false);
  });
});

describe('goats stalemated in the sliding phase', () => {
  it('declares a tiger win when Goats is to move and cannot', () => {
    // Contrived but internally consistent: the only empty points are 0, 1
    // and 5, and every one of their occupied neighbours is a tiger, so no
    // goat has anywhere to slide. Lim & Nievergelt note this arises only
    // with goat cooperation.
    const goats = [3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const state = position([2, 6, 10, 24], goats, { turn: GOAT });

    expect(state.goatsCaptured).toBe(2);          // 20 placed, 18 alive
    expect(inPlacementPhase(state)).toBe(false);
    expect(generateMoves(state)).toHaveLength(0);
    expect(outcome(state)).toBe('tigers-win');
  });

  it('never stalemates Goats during the placement phase', () => {
    // 4 tigers plus at most 20 goats is 24 pieces on 25 points, so an
    // empty point always exists while goats are still being placed.
    const rng = makeRng(4242);
    const state = initialState();

    for (let ply = 0; ply < 200 && inPlacementPhase(state); ply++) {
      if (state.turn === GOAT) expect(generateMoves(state).length).toBeGreaterThan(0);
      const moves = generateMoves(state);
      if (moves.length === 0) break;
      applyMove(state, moves[Math.floor(rng() * moves.length)]);
    }
  });
});

describe('outcome agrees with move generation across random games', () => {
  it('reports ongoing exactly while legal moves remain and captures are below five', () => {
    const rng = makeRng(31337);
    const state = initialState();

    for (let ply = 0; ply < 300; ply++) {
      const moves = generateMoves(state);
      const result = outcome(state, moves);

      if (state.goatsCaptured >= GOATS_TO_LOSE) {
        expect(result).toBe('tigers-win');
        break;
      }
      if (moves.length === 0) {
        expect(result).toBe(state.turn === TIGER ? 'goats-win' : 'tigers-win');
        break;
      }
      expect(result).toBe('ongoing');
      applyMove(state, moves[Math.floor(rng() * moves.length)]);
    }
  });
});
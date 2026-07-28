import { EMPTY, GOAT, POINTS, TIGER, TIGER_START, TOTAL_GOATS } from '../board';
import {
    applyMove,
    cloneState,
    GameState,
    generateMoves, generateTigerMoves,
    initialState,
    inPlacementPhase, Move,
    undoMove,
} from '../moves';

/** Deterministic pseudo-random generator, so failures are reproducible. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a position from a sparse description, for hand-crafted tests. */
function position(pieces: Record<number, number>, overrides: Partial<GameState> = {}): GameState {
  const state: GameState = {
    board: new Int8Array(POINTS),
    turn: TIGER,
    goatsPlaced: TOTAL_GOATS,
    goatsCaptured: 0,
    ...overrides,
  };
  for (const [point, piece] of Object.entries(pieces)) {
    state.board[Number(point)] = piece;
  }
  return state;
}

describe('initial position', () => {
  it('places four tigers on the corners and nothing else', () => {
    const state = initialState();
    for (const corner of TIGER_START) expect(state.board[corner]).toBe(TIGER);
    const occupied = [...state.board].filter((p) => p !== EMPTY);
    expect(occupied).toHaveLength(4);
  });

  it('starts with Goats to move, in the placement phase', () => {
    const state = initialState();
    expect(state.turn).toBe(GOAT);
    expect(state.goatsPlaced).toBe(0);
    expect(state.goatsCaptured).toBe(0);
    expect(inPlacementPhase(state)).toBe(true);
  });

  it('gives Goats 21 legal first moves, all placements', () => {
    const moves = generateMoves(initialState());
    expect(moves).toHaveLength(21);          // 25 points minus 4 tigers
    expect(moves.every((m) => m.kind === 'place')).toBe(true);
  });

  it('gives Tigers 12 slides and no jumps on an empty board', () => {
    const state = initialState();
    state.turn = TIGER;
    const moves = generateTigerMoves(state);
    expect(moves).toHaveLength(12);          // 4 corners x 3 neighbours
    expect(moves.some((m) => m.kind === 'jump')).toBe(false);
  });
});

describe('capture generation', () => {
  it('offers a jump when a goat sits between a tiger and an empty point', () => {
    const state = position({ 0: TIGER, 1: GOAT });
    const jumps = generateMoves(state).filter((m) => m.kind === 'jump');
    expect(jumps).toContainEqual({ kind: 'jump', from: 0, over: 1, to: 2 });
  });

  it('refuses a jump when the landing point is occupied', () => {
    const state = position({ 0: TIGER, 1: GOAT, 2: GOAT });
    const jumps = generateMoves(state).filter((m) => m.kind === 'jump');
    expect(jumps.every((m) => m.kind === 'jump' && m.to !== 2)).toBe(true);
  });

  it('refuses a jump over another tiger', () => {
    const state = position({ 0: TIGER, 1: TIGER });
    const jumps = generateMoves(state).filter((m) => m.kind === 'jump');
    expect(jumps.every((m) => m.kind === 'jump' && m.over !== 1)).toBe(true);
  });

  it('never generates a jump for Goats', () => {
    const state = position({ 12: GOAT, 7: TIGER }, { turn: GOAT });
    expect(generateMoves(state).some((m) => m.kind === 'jump')).toBe(false);
  });
});

describe('phase transition', () => {
  it('switches Goats from placing to sliding once 20 are placed', () => {
    const state = position({ 0: GOAT, 1: TIGER }, { turn: GOAT, goatsPlaced: TOTAL_GOATS });
    expect(inPlacementPhase(state)).toBe(false);
    const moves = generateMoves(state);
    expect(moves.every((m) => m.kind === 'slide')).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
  });
});

describe('apply and undo are exact inverses', () => {
  it('restores the position after any single legal move', () => {
    const state = initialState();
    state.turn = TIGER;                       // exercise slides as well as placements
    for (const move of generateMoves(state)) {
      const before = cloneState(state);
      applyMove(state, move);
      undoMove(state, move);
      expect(state).toEqual(before);
    }
  });

  it('restores the position after a capture', () => {
    const state = position({ 0: TIGER, 1: GOAT });
    const before = cloneState(state);
    const jump = generateMoves(state).find((m) => m.kind === 'jump') as Move;
    applyMove(state, jump);
    expect(state.goatsCaptured).toBe(1);
    expect(state.board[1]).toBe(EMPTY);
    undoMove(state, jump);
    expect(state).toEqual(before);
  });

  it('unwinds a 60-ply random game back to the initial position', () => {
    const rng = makeRng(20260728);
    const state = initialState();
    const start = cloneState(state);
    const played: Move[] = [];

    for (let ply = 0; ply < 60; ply++) {
      const moves = generateMoves(state);
      if (moves.length === 0) break;          // tigers trapped
      const move = moves[Math.floor(rng() * moves.length)];
      applyMove(state, move);
      played.push(move);
    }

    expect(played.length).toBeGreaterThan(40);
    for (let i = played.length - 1; i >= 0; i--) undoMove(state, played[i]);
    expect(state).toEqual(start);
  });
});

describe('state invariants hold throughout a random game', () => {
  it('never exceeds 20 placed goats and keeps piece counts consistent', () => {
    const rng = makeRng(99);
    const state = initialState();

    for (let ply = 0; ply < 120; ply++) {
      const moves = generateMoves(state);
      if (moves.length === 0) break;
      applyMove(state, moves[Math.floor(rng() * moves.length)]);

      const tigers = [...state.board].filter((p) => p === TIGER).length;
      const goats = [...state.board].filter((p) => p === GOAT).length;

      expect(tigers).toBe(4);                                   // tigers are never removed
      expect(state.goatsPlaced).toBeLessThanOrEqual(TOTAL_GOATS);
      expect(goats).toBe(state.goatsPlaced - state.goatsCaptured);
    }
  });
});
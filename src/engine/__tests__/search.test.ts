import { GOAT, POINTS, TIGER } from '../board';
import { applyMove, GameState, generateMoves, initialState } from '../moves';
import {
    hashKey, MATE_THRESHOLD,
    moveDelta,
    search, zobristHash,
    ZobristKey,
} from '../search';

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

function applyDelta(hash: ZobristKey, delta: ZobristKey): ZobristKey {
  return { a: (hash.a ^ delta.a) >>> 0, b: (hash.b ^ delta.b) >>> 0 };
}

describe('zobristHash', () => {
  it('is deterministic for the same state', () => {
    const s = initialState();
    expect(zobristHash(s)).toEqual(zobristHash(s));
  });

  it('changes when a single square changes', () => {
    const a = position([0], [1]);
    const b = position([0], [2]);
    expect(zobristHash(a)).not.toEqual(zobristHash(b));
  });

  it('changes when the turn changes but the board does not', () => {
    const a = position([0], [1], { turn: TIGER });
    const b = position([0], [1], { turn: GOAT });
    expect(zobristHash(a)).not.toEqual(zobristHash(b));
  });

  it('does not depend on goatsCaptured, since it is derivable from the board and goatsPlaced', () => {
    const a = position([0], [1], { goatsPlaced: 5, goatsCaptured: 0 });
    const b = position([0], [1], { goatsPlaced: 5, goatsCaptured: 3 });
    expect(zobristHash(a)).toEqual(zobristHash(b));
  });
});

describe('moveDelta matches a full hash recompute', () => {
  it('agrees with zobristHash across a random game, move by move', () => {
    const rng = makeRng(99);
    const state = initialState();
    let hash = zobristHash(state);

    for (let ply = 0; ply < 60; ply++) {
      const moves = generateMoves(state);
      if (moves.length === 0) break;
      const move = moves[Math.floor(rng() * moves.length)];

      const delta = moveDelta(state, move);
      applyMove(state, move);
      hash = applyDelta(hash, delta);

      expect(hash).toEqual(zobristHash(state));
    }
  });
});

describe('search finds an immediate capture', () => {
  it('recommends the jump when a goat is en prise and nothing better is available', () => {
    // Same crafted position evaluate.test.ts uses for countGoatsEnPrise:
    // tiger on 0, goat on 1, landing point 2 empty. The only sensible
    // move for Tigers here is to take it.
    const state = position([0], [1], { turn: TIGER, goatsPlaced: 1, goatsCaptured: 0 });
    const result = search(state, { maxDepth: 2 });

    expect(result.bestMove).toEqual({ kind: 'jump', from: 0, over: 1, to: 2 });
  });
  
});

describe('iterative deepening', () => {
  it('reports the requested depth and a positive node count', () => {
    const result = search(initialState(), { maxDepth: 2 });
    expect(result.depth).toBe(2);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.bestMove).not.toBeNull();
  });

  it('respects a time budget without hanging', () => {
    const started = Date.now();
    const result = search(initialState(), { maxDepth: 20, timeLimitMs: 50 });
    const elapsed = Date.now() - started;

    expect(result.bestMove).not.toBeNull();
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('repetition draw', () => {
  it('scores a move into a previously-seen position as a draw', () => {
    // Placement phase, Tigers to move. Tiger on 0 has exactly two legal
    // moves: jump 0-1-2 (goat on 1, landing 2 empty), or slide 0->5.
    // The other jumps are blocked — 0-5-10 has no goat on 5, and
    // 0-6-12 has a goat on 6 but the landing point 12 is occupied.
    const makePosition = () =>
      position([0], [1, 6, 7, 11, 12], { turn: TIGER });

    const baseline = search(makePosition(), { maxDepth: 2 });
    // The capture is worth a full goat, so Tigers stand clearly better.
    expect(baseline.score).toBeGreaterThan(0);

    // Now declare the post-jump position to have already occurred earlier
    // in the game. The capture is still legal, but it now leads to a
    // repetition, so the search must value that line at 0 rather than
    // at the value of a goat.
    const afterJump = makePosition();
    applyMove(afterJump, { kind: 'jump', from: 0, over: 1, to: 2 });

    const withHistory = search(makePosition(), {
      maxDepth: 2,
      history: [zobristHash(afterJump)],
    });

    expect(withHistory.score).toBeLessThan(baseline.score);
  });
});

describe('search with features disabled', () => {
    it('plain minimax (no pruning, no TT) agrees with alpha-beta + TT on the minimax value', () => {
        const state = initialState();
        const plain = search(state, { maxDepth: 2, useAlphaBeta: false, useTT: false });
        const pruned = search(state, { maxDepth: 2 });

        expect(plain.score).toBe(pruned.score);

    });

    it('visits at least as many nodes without pruning as with it, at the same depth', () => {
        const state = initialState();
        const plain = search(state, { maxDepth: 3, useAlphaBeta: false, useTT: false });
        const pruned = search(state, { maxDepth: 3 });

        expect(plain.nodes).toBeGreaterThanOrEqual(pruned.nodes);
    });

    it('returns a move with the transposition table disabled', () => {
        const result = search(initialState(), { maxDepth: 3, useTT: false });
        expect(result.bestMove).not.toBeNull();
    });
});

describe('MATE_THRESHOLD', () => {
  it('sits comfortably above the heuristic evaluation range (bounded ~1,200)', () => {
    expect(MATE_THRESHOLD).toBeGreaterThan(1200);
  });
});

describe('hashKey', () => {
  it('produces equal keys for equal hashes and different keys for different ones', () => {
    const a: ZobristKey = { a: 1, b: 2 };
    const b: ZobristKey = { a: 1, b: 2 };
    const c: ZobristKey = { a: 1, b: 3 };
    expect(hashKey(a)).toBe(hashKey(b));
    expect(hashKey(a)).not.toBe(hashKey(c));
  });
});
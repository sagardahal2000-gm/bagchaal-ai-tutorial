/**
 * Move search for Bagh Chal: negamax with alpha-beta pruning, iterative
 * deepening, and a Zobrist-hashed transposition table.
 *
 * This is the engine's fifth module. board.ts is geometry, moves.ts is
 * state and legality, rules.ts is terminal detection, evaluate.ts is the
 * heuristic — this is the only module that decides anything by looking
 * ahead.
 *
 * Design notes (worth remembering for the viva):
 *
 * 1. Zobrist hashing is incremental, not recomputed per node. A full scan
 *    of the board happens exactly once, at the root of each search. Every
 *    move below the root updates the hash with a handful of XORs derived
 *    from the move itself (moveDelta), mirroring what applyMove is about
 *    to do to the board — without touching moves.ts. XOR is its own
 *    inverse, so the same delta that produces a child's hash also
 *    reconstructs the parent's, which is why undo needs no hash
 *    bookkeeping: each recursive call just receives its own hash value.
 *
 * 2. Two independent 32-bit hashes (a, b) are combined into one string
 *    key. This plays the role a single 64-bit hash would in a language
 *    with native 64-bit integers: collision probability is negligible,
 *    and it avoids introducing BigInt into a hot path for a gain that
 *    doesn't matter at this scale.
 *
 * 3. The same key space serves two purposes: the transposition table
 *    (caching search results) and repetition detection (recognising a
 *    position that has already occurred on the current path, or earlier
 *    in the real game via the optional `history` option). This is why
 *    rules.ts left 'draw' unimplemented — it belongs here, where the
 *    hash already exists.
 *
 * 4. Search treats a single repeated position as a draw, not three. This
 *    is deliberate: engines universally do this, because search needs to
 *    recognise "this line repeats" to value it correctly and to avoid
 *    wasting nodes on cycles, regardless of what an official rule
 *    requires for a claimable draw in an actual game.
 *
 * 5. state is mutated in place and undone (moves.ts's design), so a
 *    thrown timeout exception deep in the tree would corrupt state for
 *    every ancestor frame unless each frame guarantees its own undoMove
 *    still runs. Every applyMove is paired with undoMove in a
 *    try/finally for exactly this reason — remove it and a timed-out
 *    search leaves the board in a half-played position.
 *
 * 6. useAlphaBeta and useTT can each be switched off independently. This
 *    is for the ablation study: the same negamax powers plain minimax,
 *    alpha-beta only, and alpha-beta + TT, so the three configurations
 *    are guaranteed to differ only in what the report is measuring.
 */

import { EMPTY, GOAT, POINTS, TIGER, TOTAL_GOATS } from './board';
import {
    DEFAULT_WEIGHTS, WIN_SCORE,
    Weights,
    evaluateForSideToMove,
} from './evaluate';
import {
    GameState, Move, Side,
    applyMove,
    cloneState,
    generateMoves,
    undoMove,
} from './moves';
import { Outcome, outcome } from './rules';

/* ---------------------------------------------------------------------- *
 * Zobrist hashing
 * ---------------------------------------------------------------------- */

/** A position's hash, as two independent 32-bit halves. */
export interface ZobristKey {
  a: number;
  b: number;
}

/** splitmix32 — deterministic, so the tables are identical on every run
 *  and platform. Randomness only needs to look random; it doesn't need
 *  to be unpredictable, so a seeded PRNG is the right tool here. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    t = (t ^ (t >>> 15)) >>> 0;
    return t;
  };
}

/** One random value per piece value per point. Sized generously; only the
 *  GOAT and TIGER slots are ever read, since EMPTY squares contribute
 *  nothing to the hash. */
function buildPieceTable(rng: () => number): number[][] {
  const table: number[][] = [];
  for (let point = 0; point < POINTS; point++) {
    table[point] = [rng(), rng(), rng(), rng()];
  }
  return table;
}

const rngA = splitmix32(0xc0ffee);
const rngB = splitmix32(0xfacade);

const ZOBRIST_PIECE_A = buildPieceTable(rngA);
const ZOBRIST_PIECE_B = buildPieceTable(rngB);

const ZOBRIST_TURN_A = [rngA(), rngA(), rngA(), rngA()];
const ZOBRIST_TURN_B = [rngB(), rngB(), rngB(), rngB()];

const ZOBRIST_PLACED_A: number[] = [];
const ZOBRIST_PLACED_B: number[] = [];
for (let n = 0; n <= TOTAL_GOATS; n++) {
  ZOBRIST_PLACED_A[n] = rngA();
  ZOBRIST_PLACED_B[n] = rngB();
}

/** Turn always flips after every move in this game, so this XOR is the
 *  same regardless of which direction it flips. Precomputed once. */
const TURN_FLIP_A = ZOBRIST_TURN_A[GOAT] ^ ZOBRIST_TURN_A[TIGER];
const TURN_FLIP_B = ZOBRIST_TURN_B[GOAT] ^ ZOBRIST_TURN_B[TIGER];

/**
 * Full hash from scratch. Called once per search, at the root — every
 * other hash in the tree is derived incrementally via moveDelta.
 *
 * goatsPlaced is hashed even though it isn't drawn on the board, because
 * it determines the rules in force (placement vs sliding), so two
 * positions with an identical board can still be legally different.
 * goatsCaptured is deliberately NOT hashed: it's always recoverable as
 * goatsPlaced minus the number of goats currently on the board, so
 * hashing it would only add redundant bits.
 */
export function zobristHash(state: GameState): ZobristKey {
  let a = 0;
  let b = 0;
  for (let point = 0; point < POINTS; point++) {
    const piece = state.board[point];
    if (piece === EMPTY) continue;
    a ^= ZOBRIST_PIECE_A[point][piece];
    b ^= ZOBRIST_PIECE_B[point][piece];
  }
  a ^= ZOBRIST_TURN_A[state.turn];
  b ^= ZOBRIST_TURN_B[state.turn];
  a ^= ZOBRIST_PLACED_A[state.goatsPlaced];
  b ^= ZOBRIST_PLACED_B[state.goatsPlaced];
  return { a: a >>> 0, b: b >>> 0 };
}

/**
 * The XOR delta a move applies to the hash, computed from the PRE-move
 * state. XOR it into a parent's hash to get the child's; the same delta
 * applied again would restore the parent's, since XOR is its own
 * inverse — though this module never needs to do that explicitly, since
 * each recursive call receives its own hash value rather than mutating
 * a shared one.
 */
export function moveDelta(state: GameState, move: Move): ZobristKey {
  const mover = state.turn;
  let a = TURN_FLIP_A;
  let b = TURN_FLIP_B;

  switch (move.kind) {
    case 'place':
      a ^= ZOBRIST_PIECE_A[move.to][GOAT];
      b ^= ZOBRIST_PIECE_B[move.to][GOAT];
      a ^= ZOBRIST_PLACED_A[state.goatsPlaced] ^ ZOBRIST_PLACED_A[state.goatsPlaced + 1];
      b ^= ZOBRIST_PLACED_B[state.goatsPlaced] ^ ZOBRIST_PLACED_B[state.goatsPlaced + 1];
      break;
    case 'slide':
      a ^= ZOBRIST_PIECE_A[move.from][mover] ^ ZOBRIST_PIECE_A[move.to][mover];
      b ^= ZOBRIST_PIECE_B[move.from][mover] ^ ZOBRIST_PIECE_B[move.to][mover];
      break;
    case 'jump':
      a ^= ZOBRIST_PIECE_A[move.from][mover]
         ^ ZOBRIST_PIECE_A[move.to][mover]
         ^ ZOBRIST_PIECE_A[move.over][GOAT];
      b ^= ZOBRIST_PIECE_B[move.from][mover]
         ^ ZOBRIST_PIECE_B[move.to][mover]
         ^ ZOBRIST_PIECE_B[move.over][GOAT];
      break;
  }
  return { a: a >>> 0, b: b >>> 0 };
}

function applyDelta(hash: ZobristKey, delta: ZobristKey): ZobristKey {
  return { a: (hash.a ^ delta.a) >>> 0, b: (hash.b ^ delta.b) >>> 0 };
}

/** Combine both halves into one map key. Collision odds: negligible. */
export function hashKey(hash: ZobristKey): string {
  return `${hash.a}_${hash.b}`;
}

/* ---------------------------------------------------------------------- *
 * Transposition table
 * ---------------------------------------------------------------------- */

export type TTFlag = 'exact' | 'lower' | 'upper';

export interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove: Move | null;
}

/* ---------------------------------------------------------------------- *
 * Move ordering
 * ---------------------------------------------------------------------- */

function movesEqual(a: Move, b: Move): boolean {
  if (a.kind === 'place' && b.kind === 'place') return a.to === b.to;
  if (a.kind === 'slide' && b.kind === 'slide') return a.from === b.from && a.to === b.to;
  if (a.kind === 'jump' && b.kind === 'jump') {
    return a.from === b.from && a.over === b.over && a.to === b.to;
  }
  return false;
}

/**
 * TT move first — it was good enough to be searched and stored last
 * time — then jumps, the only capturing move in this game, before quiet
 * slides and placements. This is what lets alpha-beta cut branches early
 * instead of exploring them in raw generation order.
 */
function orderMoves(moves: Move[], preferred: Move | null): void {
  const priority = (m: Move): number => {
    if (preferred && movesEqual(m, preferred)) return 2;
    if (m.kind === 'jump') return 1;
    return 0;
  };
  moves.sort((m1, m2) => priority(m2) - priority(m1));
}

/* ---------------------------------------------------------------------- *
 * Terminal scoring
 * ---------------------------------------------------------------------- */

type TerminalOutcome = Exclude<Outcome, 'ongoing'>;

/**
 * WIN_SCORE minus ply, so a forced mate in 2 outranks a forced mate in 6.
 * Without this, negamax would be indifferent between mates of different
 * lengths, and indifferent between losing now and losing in ten moves —
 * both are bad for the report and bad for a training tool that's
 * supposed to demonstrate the fastest punishment for a mistake.
 */
function terminalScore(result: TerminalOutcome, sideToMove: Side, ply: number): number {
  if (result === 'draw') return 0;
  const winner: Side = result === 'tigers-win' ? TIGER : GOAT;
  const magnitude = WIN_SCORE - ply;
  return winner === sideToMove ? magnitude : -magnitude;
}

/** Any score this far below WIN_SCORE can only be a mate line — the
 *  heuristic evaluation is bounded well under this (see evaluate.ts). */
export const MATE_THRESHOLD = WIN_SCORE - 1000;

/* ---------------------------------------------------------------------- *
 * Search
 * ---------------------------------------------------------------------- */

class SearchTimeout extends Error {}

interface SearchContext {
  weights: Weights;
  tt: Map<string, TTEntry>;
  pathCounts: Map<string, number>;
  stats: { nodes: number };
  deadline: number;
  useAlphaBeta: boolean;
  useTT: boolean;
}

function negamax(
  state: GameState,
  hash: ZobristKey,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext,
): number {
  ctx.stats.nodes++;
  if (ctx.stats.nodes % 2048 === 0 && Date.now() > ctx.deadline) {
    throw new SearchTimeout();
  }

  const key = hashKey(hash);

  // A position seen once already on this path (or in the real-game
  // history supplied to search()) is treated as a draw. See file header,
  // note 4, for why one repeat is enough here even though a claimable
  // draw in an actual game needs three.
  if ((ctx.pathCounts.get(key) ?? 0) > 0) return 0;

  const moves = generateMoves(state);
  const result = outcome(state, moves);
  if (result !== 'ongoing') return terminalScore(result, state.turn, ply);

  if (depth <= 0) return evaluateForSideToMove(state, ctx.weights);

  let ttMove: Move | null = null;
  if (ctx.useTT) {
    const ttEntry = ctx.tt.get(key);
    if (ttEntry) {
      ttMove = ttEntry.bestMove;
      if (ctx.useAlphaBeta && ttEntry.depth >= depth) {
        if (ttEntry.flag === 'exact') return ttEntry.score;
        if (ttEntry.flag === 'lower') alpha = Math.max(alpha, ttEntry.score);
        else beta = Math.min(beta, ttEntry.score);
        if (alpha >= beta) return ttEntry.score;
      }
    }
  }

  orderMoves(moves, ttMove);

  const originalAlpha = alpha;
  let bestScore = -Infinity;
  let bestMove: Move | null = null;

  ctx.pathCounts.set(key, (ctx.pathCounts.get(key) ?? 0) + 1);
  try {
    for (const move of moves) {
      const childHash = applyDelta(hash, moveDelta(state, move));
      const [childAlpha, childBeta] = ctx.useAlphaBeta ? [-beta, -alpha] : [-Infinity, Infinity];

      applyMove(state, move);
      let score: number;
      try {
        score = -negamax(state, childHash, depth - 1, childAlpha, childBeta, ply + 1, ctx);
      } finally {
        // Runs even if a SearchTimeout unwinds through this frame, so a
        // timed-out search never leaves the shared state object with a
        // move applied but not reversed.
        undoMove(state, move);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (ctx.useAlphaBeta) {
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
    }
  } finally {
    ctx.pathCounts.set(key, (ctx.pathCounts.get(key) ?? 1) - 1);
  }

  if (ctx.useTT) {
    const flag: TTFlag =
      bestScore <= originalAlpha ? 'upper' : bestScore >= beta ? 'lower' : 'exact';
    ctx.tt.set(key, { depth, score: bestScore, flag, bestMove });
  }

  return bestScore;
}

export interface SearchOptions {
  weights?: Weights;
  /** Hard ceiling on iterative deepening. Default 8. */
  maxDepth?: number;
  /** Time budget in ms; if set, iterative deepening stops as soon as
   *  it's spent, returning the last depth completed in full. */
  timeLimitMs?: number;
  /** Hashes of positions already reached earlier in the real game
   *  leading up to `state`, so the search can recognise a candidate
   *  move that would repeat one of them. Does not include `state`
   *  itself. */
  history?: ZobristKey[];
  /** Ablation switches. Both default true; a real training-tool search
   *  should never turn these off. */
  useAlphaBeta?: boolean;
  useTT?: boolean;
}

export interface SearchResult {
  bestMove: Move | null;
  /** Value to the side to move in the given state. */
  score: number;
  /** Deepest depth completed before the time budget or maxDepth stopped it. */
  depth: number;
  nodes: number;
  timeMs: number;
  pv: Move[];
}

const DEFAULT_MAX_DEPTH = 8;

/** Walks the TT's stored best moves forward from `state`, for reporting.
 *  Runs on a clone, so it never disturbs the caller's position. */
function extractPV(state: GameState, tt: Map<string, TTEntry>, maxLen: number): Move[] {
  const pv: Move[] = [];
  const scratch = cloneState(state);
  let hash = zobristHash(scratch);

  for (let i = 0; i < maxLen; i++) {
    const entry = tt.get(hashKey(hash));
    if (!entry || !entry.bestMove) break;
    const move = entry.bestMove;
    hash = applyDelta(hash, moveDelta(scratch, move));
    applyMove(scratch, move);
    pv.push(move);
  }
  return pv;
}

/**
 * Iterative deepening driver. Searches depth 1, then 2, then 3 …, reusing
 * the same transposition table each time, until maxDepth is reached, the
 * time budget runs out, or a forced mate is found. The result reported is
 * always from the last depth completed in full — a depth abandoned
 * partway through by a timeout is discarded, not reported, since a
 * partially-searched depth's "best" move is an artifact of move order,
 * not a real comparison across the position.
 */
export function search(state: GameState, options: SearchOptions = {}): SearchResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const deadline = options.timeLimitMs !== undefined
    ? Date.now() + options.timeLimitMs
    : Infinity;

  const tt = new Map<string, TTEntry>();
  const pathCounts = new Map<string, number>();
  for (const h of options.history ?? []) {
    const key = hashKey(h);
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
  }

  const stats = { nodes: 0 };
  const ctx: SearchContext = {
    weights,
    tt,
    pathCounts,
    stats,
    deadline,
    useAlphaBeta: options.useAlphaBeta ?? true,
    useTT: options.useTT ?? true,
  };
  const rootHash = zobristHash(state);
  const rootKey = hashKey(rootHash);

  const start = Date.now();
  let last: SearchResult = { bestMove: null, score: 0, depth: 0, nodes: 0, timeMs: 0, pv: [] };

  for (let depth = 1; depth <= maxDepth; depth++) {
    let score: number;
    try {
      score = negamax(state, rootHash, depth, -Infinity, Infinity, 0, ctx);
    } catch (err) {
      if (err instanceof SearchTimeout) break;
      throw err;
    }

    const entry = ctx.useTT ? tt.get(rootKey) : undefined;
    last = {
      bestMove: entry?.bestMove ?? last.bestMove,
      score,
      depth,
      nodes: stats.nodes,
      timeMs: Date.now() - start,
      pv: ctx.useTT ? extractPV(state, tt, depth) : last.pv,
    };

    if (Date.now() >= deadline) break;
    if (Math.abs(score) >= MATE_THRESHOLD) break;
  }

  return last;
}
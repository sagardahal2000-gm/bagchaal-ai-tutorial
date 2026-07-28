/**
 * Puzzle solving and verification by depth-limited proof search.
 *
 * This is the engine's second application of adversarial search, and it
 * asks a different question from search.ts. Negamax asks "which move is
 * best?" and answers with a number. This asks "is there a forced
 * solution?" and answers with a proof.
 *
 * The tree is AND/OR:
 *   - At the solver's nodes (OR), ONE move needs to succeed.
 *   - At the opponent's nodes (AND), EVERY reply must still lead to
 *     success, or the line is refuted.
 *
 * Two goal modes, which between them cover the puzzle types named in the
 * proposal:
 *   - 'achieve'  — reach a state satisfying the predicate within
 *                  maxPlies. ("Trap the tiger in two moves.")
 *   - 'maintain' — keep the predicate true for maxPlies against every
 *                  opponent reply. ("Save the threatened goat.")
 *
 * Puzzles are therefore solved at runtime, not looked up: nothing here
 * stores an answer key, and a position can be validated before it is
 * ever shown to a user.
 */

import { GOAT, TIGER } from './board';
import { countGoatsEnPrise } from './evaluate';
import {
    GameState, Move, Side,
    applyMove,
    cloneState, generateMoves,
    undoMove,
} from './moves';
import { countTrappedTigers, outcome, tigersImmobilised } from './rules';
import { ZobristKey, applyDelta, hashKey, moveDelta, zobristHash } from './search';

/** A condition on a position. Puzzles are defined by one of these. */
export type Goal = (state: GameState) => boolean;

export type GoalMode = 'achieve' | 'maintain';

export interface Puzzle {
  id: string;
  /** Starting position. It must be the solver's turn to move. */
  position: GameState;
  /** Which side the user is playing. */
  solver: Side;
  goal: Goal;
  mode: GoalMode;
  /** Ply budget. A "solve in 2 moves" puzzle for the solver, with an
   *  opponent reply in between, is 3 plies. */
  maxPlies: number;
  /** Shown in the UI. Not used by the search. */
  prompt: string;
}

export interface PuzzleSolution {
  solved: boolean;
  /**
   * One continuation demonstrating the solution, for display as a hint
   * or walkthrough. Note this is a LINE, while the proof is a TREE: the
   * search verified every opponent reply, but only the first is shown.
   */
  line: Move[];
  nodes: number;
  timeMs: number;
}

/* ---------------------------------------------------------------------- *
 * Goal predicates
 * ---------------------------------------------------------------------- */

/** Tigers have captured at least n goats. */
export const capturesAtLeast = (n: number): Goal =>
  (state) => state.goatsCaptured >= n;

/** Tigers have captured no more than n goats. A 'maintain' goal. */
export const capturesAtMost = (n: number): Goal =>
  (state) => state.goatsCaptured <= n;

/** At least n tigers have no legal move. */
export const trapsAtLeast = (n: number): Goal =>
  (state) => countTrappedTigers(state) >= n;

/** No tiger can move at all — the goats' win condition. */
export const allTigersTrapped: Goal = (state) => tigersImmobilised(state);

/** No goat can be captured on the very next move. */
export const noGoatEnPrise: Goal = (state) => countGoatsEnPrise(state) === 0;

/* ---------------------------------------------------------------------- *
 * Proof search
 * ---------------------------------------------------------------------- */

class ProofTimeout extends Error {}

interface ProofContext {
  goal: Goal;
  mode: GoalMode;
  solver: Side;
  /** Keyed by position hash and remaining depth, since the same position
   *  with fewer plies left is a genuinely different question. */
  memo: Map<string, Move[] | null>;
  stats: { nodes: number };
  deadline: number;
}

function prove(
  state: GameState,
  hash: ZobristKey,
  depth: number,
  ply: number,
  ctx: ProofContext,
): Move[] | null {
  ctx.stats.nodes++;
  if (ctx.stats.nodes % 2048 === 0 && Date.now() > ctx.deadline) {
    throw new ProofTimeout();
  }

  const goalHolds = ctx.goal(state);

  if (ctx.mode === 'achieve') {
    // ply > 0 because a puzzle whose goal is already true at the start
    // is not a puzzle; requiring a move forces real work.
    if (ply > 0 && goalHolds) return [];
    if (depth === 0) return null;
  } else {
    if (!goalHolds) return null;
    if (depth === 0) return [];
  }

  const memoKey = `${hashKey(hash)}|${depth}`;
  const cached = ctx.memo.get(memoKey);
  if (cached !== undefined) return cached;

  const moves = generateMoves(state);
  const result = outcome(state, moves);

  if (result !== 'ongoing') {
    // The game ended. For 'achieve' the goal was already checked above
    // and did not hold, so this line failed. For 'maintain' the
    // predicate held throughout, so it succeeded unless the solver is
    // the side that just lost.
    let verdict: Move[] | null = null;
    if (ctx.mode === 'maintain') {
      const solverLost =
        (result === 'tigers-win' && ctx.solver === GOAT) ||
        (result === 'goats-win' && ctx.solver === TIGER);
      verdict = solverLost ? null : [];
    }
    ctx.memo.set(memoKey, verdict);
    return verdict;
  }

  const isSolverTurn = state.turn === ctx.solver;
  let verdict: Move[] | null = null;

  for (const move of moves) {
    const childHash = applyDelta(hash, moveDelta(state, move));
    applyMove(state, move);
    let sub: Move[] | null;
    try {
      sub = prove(state, childHash, depth - 1, ply + 1, ctx);
    } finally {
      // Mirrors search.ts: undo must survive a timeout unwinding
      // through this frame, or every ancestor sees a corrupted board.
      undoMove(state, move);
    }

    if (isSolverTurn) {
      // OR node: the first move that works proves the position.
      if (sub !== null) {
        verdict = [move, ...sub];
        break;
      }
    } else {
      // AND node: a single surviving reply refutes the whole line.
      if (sub === null) {
        verdict = null;
        break;
      }
      // Keep the first reply's continuation for display purposes.
      if (verdict === null) verdict = [move, ...sub];
    }
  }

  ctx.memo.set(memoKey, verdict);
  return verdict;
}

export interface SolveOptions {
  /** Milliseconds before the search gives up. Default 5000. */
  timeLimitMs?: number;
}

/**
 * Solve a puzzle by proof search. Returns whether a forced solution
 * exists and, if so, one line demonstrating it.
 *
 * Runs on a clone, so the caller's position is never disturbed.
 */
export function solvePuzzle(puzzle: Puzzle, options: SolveOptions = {}): PuzzleSolution {
  const state = cloneState(puzzle.position);
  const ctx: ProofContext = {
    goal: puzzle.goal,
    mode: puzzle.mode,
    solver: puzzle.solver,
    memo: new Map(),
    stats: { nodes: 0 },
    deadline: Date.now() + (options.timeLimitMs ?? 5000),
  };

  const start = Date.now();
  let line: Move[] | null = null;
  try {
    line = prove(state, zobristHash(state), puzzle.maxPlies, 0, ctx);
  } catch (err) {
    if (!(err instanceof ProofTimeout)) throw err;
  }

  return {
    solved: line !== null,
    line: line ?? [],
    nodes: ctx.stats.nodes,
    timeMs: Date.now() - start,
  };
}

export interface PuzzleValidation extends PuzzleSolution {
  /** How many distinct first moves lead to a forced solution. */
  solutionCount: number;
  /** True when exactly one first move works — the mark of a good puzzle. */
  unique: boolean;
}

/**
 * Validate a candidate puzzle before it is shown to a user.
 *
 * Beyond "is it solvable", this counts how many first moves work. A
 * puzzle with several solutions is not wrong, but "find the move" is a
 * far better exercise when there is exactly one, so the content layer
 * can use this to filter.
 */
export function verifyPuzzle(puzzle: Puzzle, options: SolveOptions = {}): PuzzleValidation {
  const state = cloneState(puzzle.position);
  const ctx: ProofContext = {
    goal: puzzle.goal,
    mode: puzzle.mode,
    solver: puzzle.solver,
    memo: new Map(),
    stats: { nodes: 0 },
    deadline: Date.now() + (options.timeLimitMs ?? 5000),
  };

  const start = Date.now();
  const rootHash = zobristHash(state);
  let firstLine: Move[] | null = null;
  let solutionCount = 0;

  try {
    for (const move of generateMoves(state)) {
      const childHash = applyDelta(rootHash, moveDelta(state, move));
      applyMove(state, move);
      let sub: Move[] | null;
      try {
        sub = prove(state, childHash, puzzle.maxPlies - 1, 1, ctx);
      } finally {
        undoMove(state, move);
      }
      if (sub !== null) {
        solutionCount++;
        if (firstLine === null) firstLine = [move, ...sub];
      }
    }
  } catch (err) {
    if (!(err instanceof ProofTimeout)) throw err;
  }

  return {
    solved: solutionCount > 0,
    line: firstLine ?? [],
    solutionCount,
    unique: solutionCount === 1,
    nodes: ctx.stats.nodes,
    timeMs: Date.now() - start,
  };
}
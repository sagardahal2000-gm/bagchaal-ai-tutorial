import { GOAT, POINTS, TIGER, idx } from '../engine/board';
import { GameState, Move, Side } from '../engine/moves';
import {
  Puzzle,
  capturesAtLeast,
  noGoatEnPrise,
  solvePuzzle,
  trapsAtLeast,
} from '../engine/puzzle';

/* ------------------------------------------------------------------ *
 * Position construction
 *
 * These positions are constructed for instruction. Like most published
 * puzzle sets they are chosen to isolate one idea, and are not required
 * to be reachable from the opening by legal play.
 * ------------------------------------------------------------------ */

function position(
  tigers: readonly number[],
  goats: readonly number[],
  opts: { turn: Side; goatsPlaced?: number; goatsCaptured?: number },
): GameState {
  const board = new Int8Array(POINTS);
  for (const point of tigers) board[point] = TIGER;
  for (const point of goats) board[point] = GOAT;
  const goatsCaptured = opts.goatsCaptured ?? 0;
  return {
    board,
    turn: opts.turn,
    goatsPlaced: opts.goatsPlaced ?? goats.length + goatsCaptured,
    goatsCaptured,
  };
}

/** The four tigers in their opening corners. */
const CORNERS = [idx(0, 0), idx(0, 4), idx(4, 0), idx(4, 4)] as const;

/* ------------------------------------------------------------------ */

export interface AuthoredPuzzle extends Puzzle {
  /** Difficulty seed for the Elo model, refined later from real outcomes. */
  rating: number;
  /** Whether exactly one first move should work. Asserted in the tests. */
  expectUnique: boolean;
}

export const PUZZLES: AuthoredPuzzle[] = [
  {
    id: 'capture-corner-1',
    prompt: 'Tigers to play. Take a goat in one move.',
    position: position(CORNERS, [idx(0, 1)], { turn: TIGER }),
    solver: TIGER,
    goal: capturesAtLeast(1),
    mode: 'achieve',
    maxPlies: 1,
    rating: 800,
    expectUnique: true,
  },
  {
    id: 'block-the-jump-1',
    prompt: 'Goats to play. A goat is attacked — place one so that no goat can be taken.',
    position: position(CORNERS, [idx(0, 1), idx(2, 2)], { turn: GOAT }),
    solver: GOAT,
    goal: noGoatEnPrise,
    mode: 'achieve',
    maxPlies: 1,
    rating: 900,
    expectUnique: true,
  },
  {
    id: 'trap-corner-tiger-1',
    prompt: 'Goats to play. One placement seals the corner tiger completely.',
    position: position(
      CORNERS,
      [idx(0, 1), idx(1, 0), idx(1, 1), idx(2, 0), idx(2, 2)],
      { turn: GOAT },
    ),
    solver: GOAT,
    goal: trapsAtLeast(1),
    mode: 'achieve',
    maxPlies: 1,
    rating: 1000,
    expectUnique: true,
  },
];

export function puzzleById(id: string): AuthoredPuzzle | undefined {
  return PUZZLES.find((puzzle) => puzzle.id === id);
}

/* ------------------------------------------------------------------ *
 * Move validation
 *
 * A user's move is correct when the position it produces still admits a
 * forced solution within the remaining ply budget.
 *
 * The goal is checked directly before any sub-solve, because prove()
 * skips its 'achieve' check at ply 0 — so a move that achieves the goal
 * outright would otherwise be scored as a failure.
 * ------------------------------------------------------------------ */

export function moveKeepsSolution(
  puzzle: Puzzle,
  next: GameState,
  pliesRemaining: number,
): boolean {
  const goalHolds = puzzle.goal(next);

  if (puzzle.mode === 'achieve' && goalHolds) return true;
  if (puzzle.mode === 'maintain' && !goalHolds) return false;
  if (pliesRemaining <= 0) return puzzle.mode === 'maintain';

  return solvePuzzle({ ...puzzle, position: next, maxPlies: pliesRemaining }).solved;
}

/** One opponent reply that keeps the puzzle alive, or null if none is needed. */
export function opponentReply(
  puzzle: Puzzle,
  next: GameState,
  pliesRemaining: number,
): Move | null {
  if (pliesRemaining <= 0) return null;
  const solution = solvePuzzle({ ...puzzle, position: next, maxPlies: pliesRemaining });
  return solution.line[0] ?? null;
}

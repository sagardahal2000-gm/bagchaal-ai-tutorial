import { GOAT, POINTS, TIGER, idx } from '../engine/board';
import { GameState, Move, Side } from '../engine/moves';
import {
  Puzzle,
  allTigersTrapped,
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

export function position(
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

/** Every point except those listed — for crowded sliding-phase positions,
 *  where listing twenty goats by hand invites a transcription error. */
export function everyPointExcept(excluded: readonly number[]): number[] {
  const skip = new Set(excluded);
  const points: number[] = [];
  for (let point = 0; point < POINTS; point++) if (!skip.has(point)) points.push(point);
  return points;
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
    id: 'capture-diagonal-1',
    prompt: 'Tigers to play. The diagonal is open — take the goat.',
    position: position(
      [idx(2, 2), idx(0, 4), idx(4, 0), idx(4, 4)],
      [idx(1, 1)],
      { turn: TIGER },
    ),
    solver: TIGER,
    goal: capturesAtLeast(1),
    mode: 'achieve',
    maxPlies: 1,
    rating: 850,
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
    id: 'block-the-diagonal-1',
    prompt: 'Goats to play. The threat comes along a diagonal this time. Stop it.',
    position: position(
      [idx(2, 2), idx(0, 4), idx(4, 0), idx(4, 4)],
      [idx(1, 1), idx(4, 2)],
      { turn: GOAT },
    ),
    solver: GOAT,
    goal: noGoatEnPrise,
    mode: 'achieve',
    maxPlies: 1,
    rating: 950,
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
  {
    id: 'trap-edge-tiger-1',
    // This tiger sits on a point with no diagonals, so it has fewer escapes
    // than a corner tiger — but one of them is a jump, which is easy to miss.
    prompt: 'Goats to play. This tiger has one escape left. Close it.',
    position: position(
      [idx(0, 1), idx(0, 4), idx(4, 0), idx(4, 4)],
      [idx(0, 0), idx(0, 2), idx(1, 1), idx(2, 1)],
      { turn: GOAT },
    ),
    solver: GOAT,
    goal: trapsAtLeast(1),
    mode: 'achieve',
    maxPlies: 1,
    rating: 1100,
    expectUnique: true,
  },
  {
    id: 'close-the-net-1',
    // Sliding phase: all twenty goats are down, one point is empty, and four
    // of the five goats beside it would open a hole behind them.
    prompt: 'Goats to play. Slide one goat and every tiger is finished.',
    position: position(
      CORNERS,
      everyPointExcept([...CORNERS, idx(0, 2)]),
      { turn: GOAT, goatsPlaced: 20 },
    ),
    solver: GOAT,
    goal: allTigersTrapped,
    mode: 'achieve',
    maxPlies: 1,
    rating: 1200,
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

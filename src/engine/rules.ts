/**
 * Terminal-position detection for Bagh Chal.
 *
 * moves.ts decides what is legal; this module decides what it means.
 *
 * Terminal status is defined for the side to move, following Lim &
 * Nievergelt (2004): "If Tigers has no legal move, Tigers loses." A
 * position in which every tiger is blocked is not yet a goat win if it is
 * Goats' turn, because a goat slide may open a line and free a tiger.
 */

import { ADJACENCY, EMPTY, GOAT, GOATS_TO_LOSE, JUMPS, POINTS, TIGER } from './board';
import {
    GameState, Move, generateMoves, generateTigerMoves, inPlacementPhase,
} from './moves';

/**
 * 'draw' is not yet produced by outcome(). Repetition detection requires
 * position history and arrives with Zobrist hashing in search.ts; the
 * variant is declared now so downstream switches remain stable.
 */
export type Outcome = 'ongoing' | 'tigers-win' | 'goats-win' | 'draw';

/**
 * The outcome of a position, from the perspective of the side to move.
 *
 * `moves` may be supplied when the caller has already generated the legal
 * moves for this position, which the search always has. Passing it avoids
 * regenerating the list at every node.
 */
export function outcome(state: GameState, moves?: Move[]): Outcome {
  if (state.goatsCaptured >= GOATS_TO_LOSE) return 'tigers-win';

  const legal = moves ?? generateMoves(state);
  if (legal.length > 0) return 'ongoing';

  // The side to move is stalemated, which in this game is a loss.
  return state.turn === TIGER ? 'goats-win' : 'tigers-win';
}

export function isTerminal(state: GameState, moves?: Move[]): boolean {
  return outcome(state, moves) !== 'ongoing';
}

/**
 * Whether a single tiger has any legal move, slide or jump.
 *
 * Used by the evaluation function to count trapped tigers, which is a
 * position feature rather than a terminal test, so it is deliberately
 * independent of whose turn it is.
 */
export function tigerIsTrapped(state: GameState, from: number): boolean {
  if (state.board[from] !== TIGER) return false;

  for (const to of ADJACENCY[from]) {
    if (state.board[to] === EMPTY) return false;
  }
  for (const { over, to } of JUMPS[from]) {
    if (state.board[over] === GOAT && state.board[to] === EMPTY) return false;
  }
  return true;
}

/** How many tigers currently have no move at all. An evaluation feature. */
export function countTrappedTigers(state: GameState): number {
  let trapped = 0;
  for (let point = 0; point < POINTS; point++) {
    if (state.board[point] === TIGER && tigerIsTrapped(state, point)) trapped++;
  }
  return trapped;
}

/** True when no tiger can move, i.e. the goats have achieved their objective. */
export function tigersImmobilised(state: GameState): boolean {
  return generateTigerMoves(state).length === 0;
}

/** Goats can always place during the placement phase: 24 pieces, 25 points. */
export function goatsCanAlwaysMove(state: GameState): boolean {
  return inPlacementPhase(state);
}
/**
 * Heuristic evaluation for Bagh Chal.
 *
 * The search cannot reach terminal nodes in this game, so it stops at a
 * depth limit and asks this module who stands better. Features follow the
 * inputs used by Lim & Nievergelt (2004) for their co-evolutionary
 * evaluation network, adapted into a lightweight weighted-sum form.
 *
 * Scores are computed from a fixed tiger-positive perspective and negated
 * once, at the boundary, for the goat side. Keeping a single perspective
 * inside the scorer avoids sign errors that would make the engine play
 * competently as one side and badly as the other.
 */

import {
    ADJACENCY,
    colOf,
    EMPTY, GOAT,
    JUMPS, POINTS,
    rowOf,
    TIGER,
} from './board';
import { GameState, generateTigerMoves, Side } from './moves';
import { countTrappedTigers } from './rules';

/**
 * Terminal score magnitude. Chosen far above any reachable heuristic value
 * (bounded at roughly 1,200) so that a forced win always outranks material.
 */
export const WIN_SCORE = 100_000;

export interface Weights {
  /** Per goat already captured. Progress toward the five-capture win. */
  goatCaptured: number;
  /** Per tiger with no legal move. Progress toward immobilisation. */
  tigerTrapped: number;
  /** Per legal tiger move available on the board. */
  tigerMobility: number;
  /** Per goat that could be captured immediately. Threats, not material. */
  goatEnPrise: number;
  /** Per adjacent goat pair. Rewards advancing in unbroken formation. */
  goatSupport: number;
  /** Per unit of total pairwise distance between tigers. Rewards spread. */
  tigerSpread: number;
}

/**
 * Starting weights. Ordered by the directness of each feature's link to a
 * win condition: captures and trapped tigers decide games, the rest shape
 * the position. These are a considered starting point, not a tuned optimum.
 */
export const DEFAULT_WEIGHTS: Weights = {
  goatCaptured: 100,
  tigerTrapped: 60,
  goatEnPrise: 15,
  tigerMobility: 2,
  goatSupport: 2,
  tigerSpread: 1,
};

/** Goats that a tiger could capture on the very next move. */
export function countGoatsEnPrise(state: GameState): number {
  const threatened = new Set<number>();

  for (let from = 0; from < POINTS; from++) {
    if (state.board[from] !== TIGER) continue;
    for (const { over, to } of JUMPS[from]) {
      if (state.board[over] === GOAT && state.board[to] === EMPTY) {
        threatened.add(over);
      }
    }
  }
  return threatened.size;
}

/**
 * Adjacent goat pairs, counted once each. A crude measure of formation
 * integrity: goats defend by leaving no gap for a tiger to jump into.
 */
export function countGoatSupport(state: GameState): number {
  let pairs = 0;
  for (let point = 0; point < POINTS; point++) {
    if (state.board[point] !== GOAT) continue;
    for (const neighbour of ADJACENCY[point]) {
      // Count each pair once by only looking forward.
      if (neighbour > point && state.board[neighbour] === GOAT) pairs++;
    }
  }
  return pairs;
}

/**
 * Total Manhattan distance between every pair of tigers. Maximal when the
 * tigers sit on the four corners, which is also their starting position.
 */
export function tigerSpread(state: GameState): number {
  const tigers: number[] = [];
  for (let point = 0; point < POINTS; point++) {
    if (state.board[point] === TIGER) tigers.push(point);
  }

  let total = 0;
  for (let i = 0; i < tigers.length; i++) {
    for (let j = i + 1; j < tigers.length; j++) {
      total += Math.abs(rowOf(tigers[i]) - rowOf(tigers[j]))
             + Math.abs(colOf(tigers[i]) - colOf(tigers[j]));
    }
  }
  return total;
}

/** Every feature of a position, exposed for testing, tuning and reporting. */
export interface Features {
  goatsCaptured: number;
  tigersTrapped: number;
  tigerMobility: number;
  goatsEnPrise: number;
  goatSupport: number;
  tigerSpread: number;
}

export function extractFeatures(state: GameState): Features {
  return {
    goatsCaptured: state.goatsCaptured,
    tigersTrapped: countTrappedTigers(state),
    tigerMobility: generateTigerMoves(state).length,
    goatsEnPrise: countGoatsEnPrise(state),
    goatSupport: countGoatSupport(state),
    tigerSpread: tigerSpread(state),
  };
}

/** The weighted sum, always from the tigers' point of view. */
export function scoreForTigers(
  state: GameState,
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  const f = extractFeatures(state);

  return weights.goatCaptured * f.goatsCaptured
       + weights.tigerMobility * f.tigerMobility
       + weights.goatEnPrise * f.goatsEnPrise
       + weights.tigerSpread * f.tigerSpread
       - weights.tigerTrapped * f.tigersTrapped
       - weights.goatSupport * f.goatSupport;
}

/** The position's value to `side`. The single point at which sign flips. */
export function evaluate(
  state: GameState,
  side: Side,
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  const score = scoreForTigers(state, weights);
  return side === TIGER ? score : -score;
}

/** What negamax needs: the value to whoever is on move. */
export function evaluateForSideToMove(
  state: GameState,
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  return evaluate(state, state.turn, weights);
}
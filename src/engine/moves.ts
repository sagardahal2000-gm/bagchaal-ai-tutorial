/**
 * Bagh Chal game state and move generation.
 *
 * This module owns everything board.ts deliberately does not know: what is
 * standing on each point, whose turn it is, and which moves are legal.
 *
 * Moves are applied by mutation and reversed by undoMove, rather than by
 * copying the state. Every move carries enough information to reverse
 * itself, so no undo stack is required.
 */

import {
    ADJACENCY,
    EMPTY, GOAT,
    JUMPS, POINTS,
    TIGER, TIGER_START, TOTAL_GOATS,
} from './board';

/** The side to move. Goats and Tigers are the only two players. */
export type Side = typeof GOAT | typeof TIGER;

/**
 * A legal move. Discriminated on `kind`, so a switch over it is
 * exhaustively checked by the compiler.
 */
export type Move =
  | { readonly kind: 'place'; readonly to: number }
  | { readonly kind: 'slide'; readonly from: number; readonly to: number }
  | { readonly kind: 'jump'; readonly from: number; readonly over: number; readonly to: number };

export interface GameState {
  /** 25 entries of EMPTY | GOAT | TIGER, indexed as in board.ts. */
  board: Int8Array;
  turn: Side;
  /** Goats dropped so far, 0..20. The placement phase ends at 20. */
  goatsPlaced: number;
  /** Goats captured by the tigers, 0..5. */
  goatsCaptured: number;
}

/** Four tigers on the corners, no goats, Goats to move first. */
export function initialState(): GameState {
  const board = new Int8Array(POINTS); // zero-filled, and EMPTY === 0
  for (const point of TIGER_START) board[point] = TIGER;
  return { board, turn: GOAT, goatsPlaced: 0, goatsCaptured: 0 };
}

export function cloneState(state: GameState): GameState {
  return {
    board: Int8Array.from(state.board),
    turn: state.turn,
    goatsPlaced: state.goatsPlaced,
    goatsCaptured: state.goatsCaptured,
  };
}

/** Derived, never stored, so it cannot drift out of step with goatsPlaced. */
export function inPlacementPhase(state: GameState): boolean {
  return state.goatsPlaced < TOTAL_GOATS;
}

export function opponent(side: Side): Side {
  return side === GOAT ? TIGER : GOAT;
}

/** Every legal move for the side to move. */
export function generateMoves(state: GameState): Move[] {
  return state.turn === GOAT ? generateGoatMoves(state) : generateTigerMoves(state);
}

/**
 * Goats place during the placement phase and slide afterwards, never both.
 * Goats never capture: this function never consults JUMPS.
 */
export function generateGoatMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  if (inPlacementPhase(state)) {
    for (let to = 0; to < POINTS; to++) {
      if (state.board[to] === EMPTY) moves.push({ kind: 'place', to });
    }
    return moves;
  }

  for (let from = 0; from < POINTS; from++) {
    if (state.board[from] !== GOAT) continue;
    for (const to of ADJACENCY[from]) {
      if (state.board[to] === EMPTY) moves.push({ kind: 'slide', from, to });
    }
  }
  return moves;
}

/**
 * Tigers slide along lines and jump goats, in either phase of the game.
 * The geometry of a jump is settled in board.ts; only occupancy is checked here.
 */
export function generateTigerMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  for (let from = 0; from < POINTS; from++) {
    if (state.board[from] !== TIGER) continue;

    for (const to of ADJACENCY[from]) {
      if (state.board[to] === EMPTY) moves.push({ kind: 'slide', from, to });
    }

    for (const { over, to } of JUMPS[from]) {
      if (state.board[over] === GOAT && state.board[to] === EMPTY) {
        moves.push({ kind: 'jump', from, over, to });
      }
    }
  }
  return moves;
}

/** Apply a move in place. Always paired with undoMove. */
export function applyMove(state: GameState, move: Move): void {
  switch (move.kind) {
    case 'place':
      state.board[move.to] = GOAT;
      state.goatsPlaced++;
      break;
    case 'slide':
      // Copies whatever piece is on `from`, so this serves both sides.
      state.board[move.to] = state.board[move.from];
      state.board[move.from] = EMPTY;
      break;
    case 'jump':
      state.board[move.to] = TIGER;
      state.board[move.from] = EMPTY;
      state.board[move.over] = EMPTY;
      state.goatsCaptured++;
      break;
  }
  state.turn = opponent(state.turn);
}

/**
 * Exactly reverse applyMove. A jump can only have been a tiger passing over
 * a goat, so the move alone carries everything needed to restore the position.
 */
export function undoMove(state: GameState, move: Move): void {
  state.turn = opponent(state.turn);

  switch (move.kind) {
    case 'place':
      state.board[move.to] = EMPTY;
      state.goatsPlaced--;
      break;
    case 'slide':
      state.board[move.from] = state.board[move.to];
      state.board[move.to] = EMPTY;
      break;
    case 'jump':
      state.board[move.from] = TIGER;
      state.board[move.over] = GOAT;
      state.board[move.to] = EMPTY;
      state.goatsCaptured--;
      break;
  }
}
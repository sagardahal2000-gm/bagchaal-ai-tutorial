/**
 * Bagh Chal board geometry.
 *
 * Points are indexed 0..24 as row * 5 + col:
 *
 *    0  1  2  3  4
 *    5  6  7  8  9
 *   10 11 12 13 14
 *   15 16 17 18 19
 *   20 21 22 23 24
 *
 * Orthogonal lines connect every point to its horizontal and vertical
 * neighbours. Diagonal lines exist only at points where (row + col) is
 * even. This single rule produces the board's characteristic pattern.
 *
 * This module is pure geometry: it never knows what is standing on the
 * board. Both tables are computed once at import and are immutable.
 */

export const SIZE = 5;
export const POINTS = SIZE * SIZE; // 25

// Plain constants rather than a TypeScript `const enum`, which Metro's
// Babel transform does not handle reliably.
export const EMPTY = 0;
export const GOAT = 1;
export const TIGER = 2;
export type Piece = typeof EMPTY | typeof GOAT | typeof TIGER;

export function idx(row: number, col: number): number {
  return row * SIZE + col;
}

export function rowOf(i: number): number {
  return Math.floor(i / SIZE);
}

export function colOf(i: number): number {
  return i % SIZE;
}

function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/** Diagonal lines pass through a point only when (row + col) is even. */
export function hasDiagonals(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

const DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function directionsFrom(row: number, col: number) {
  return hasDiagonals(row, col) ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL;
}

/** Neighbours of each point, i.e. every one-step slide the geometry allows. */
function buildAdjacency(): number[][] {
  const adjacency: number[][] = [];

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const neighbours: number[] = [];

      for (const [dr, dc] of directionsFrom(row, col)) {
        const nr = row + dr;
        const nc = col + dc;
        if (onBoard(nr, nc)) neighbours.push(idx(nr, nc));
      }

      adjacency.push(neighbours);
    }
  }

  return adjacency;
}

export const ADJACENCY: ReadonlyArray<ReadonlyArray<number>> = buildAdjacency();

/** A geometrically possible jump: leave `from`, pass `over`, land on `to`. */
export interface Jump {
  readonly over: number;
  readonly to: number;
}

/**
 * Jumps available from each point, ignoring occupancy entirely.
 * A jump is valid only if BOTH hops are real lines on the board, which is
 * what rules out "jumping" across a diagonal that isn't drawn.
 */
function buildJumps(): Jump[][] {
  const jumps: Jump[][] = [];

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const from = idx(row, col);
      const list: Jump[] = [];

      for (const [dr, dc] of directionsFrom(row, col)) {
        const midRow = row + dr;
        const midCol = col + dc;
        const toRow = row + 2 * dr;
        const toCol = col + 2 * dc;

        if (!onBoard(midRow, midCol) || !onBoard(toRow, toCol)) continue;

        const over = idx(midRow, midCol);
        const to = idx(toRow, toCol);

        // Both hops must follow lines that actually exist.
        if (!ADJACENCY[from].includes(over)) continue;
        if (!ADJACENCY[over].includes(to)) continue;

        list.push({ over, to });
      }

      jumps.push(list);
    }
  }

  return jumps;
}

export const JUMPS: ReadonlyArray<ReadonlyArray<Jump>> = buildJumps();

/** The four tigers begin on the corners. */
export const TIGER_START: ReadonlyArray<number> = [
  idx(0, 0), idx(0, 4), idx(4, 0), idx(4, 4),
];

export const TOTAL_GOATS = 20;
export const GOATS_TO_LOSE = 5;
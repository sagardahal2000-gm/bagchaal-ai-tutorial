import { GOAT, POINTS, TIGER } from '../board';
import { GameState } from '../moves';
import {
    Puzzle,
    allTigersTrapped,
    capturesAtLeast, capturesAtMost,
    solvePuzzle,
    trapsAtLeast,
    verifyPuzzle,
} from '../puzzle';

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

describe("'achieve' puzzles", () => {
  it('finds a capture available in one ply', () => {
    // Tiger on 0, goat on 1, landing point 2 empty.
    const puzzle: Puzzle = {
      id: 'capture-1',
      position: position([0], [1], { turn: TIGER }),
      solver: TIGER,
      goal: capturesAtLeast(1),
      mode: 'achieve',
      maxPlies: 1,
      prompt: 'Capture a goat.',
    };

    const result = solvePuzzle(puzzle);
    expect(result.solved).toBe(true);
    expect(result.line).toEqual([{ kind: 'jump', from: 0, over: 1, to: 2 }]);
  });

  it('traps the last tiger with a single placement', () => {
    // Tiger on 0. Its neighbours are 1, 5 and 6; the corresponding jump
    // landings are 2, 10 and 12. Goats hold everything except 6, so
    // placing there closes the last escape and blocks the last jump.
    const puzzle: Puzzle = {
      id: 'trap-1',
      position: position([0], [1, 5, 2, 10, 12], { turn: GOAT }),
      solver: GOAT,
      goal: allTigersTrapped,
      mode: 'achieve',
      maxPlies: 1,
      prompt: 'Trap the tiger in one move.',
    };

    const result = solvePuzzle(puzzle);
    expect(result.solved).toBe(true);
    expect(result.line).toEqual([{ kind: 'place', to: 6 }]);
  });

  it('reports no solution when the ply budget is too small', () => {
    // The same trap, but the goal now demands two trapped tigers and
    // there is only one tiger on the board.
    const puzzle: Puzzle = {
      id: 'trap-impossible',
      position: position([0], [1, 5, 2, 10, 12], { turn: GOAT }),
      solver: GOAT,
      goal: trapsAtLeast(2),
      mode: 'achieve',
      maxPlies: 1,
      prompt: 'Trap two tigers.',
    };

    expect(solvePuzzle(puzzle).solved).toBe(false);
  });
});

describe("'maintain' puzzles", () => {
  it('saves a threatened goat by blocking the landing point', () => {
    // Tiger on 0 threatens the goat on 1 by jumping to 2. Goats move
    // first and must survive the tiger's reply without losing a goat.
    const puzzle: Puzzle = {
      id: 'save-1',
      position: position([0], [1], { turn: GOAT }),
      solver: GOAT,
      goal: capturesAtMost(0),
      mode: 'maintain',
      maxPlies: 2,
      prompt: 'Save the threatened goat.',
    };

    const result = solvePuzzle(puzzle);
    expect(result.solved).toBe(true);
    expect(result.line[0]).toEqual({ kind: 'place', to: 2 });
  });
});

describe('verifyPuzzle', () => {
  it('recognises a puzzle with exactly one solution', () => {
    const puzzle: Puzzle = {
      id: 'trap-1',
      position: position([0], [1, 5, 2, 10, 12], { turn: GOAT }),
      solver: GOAT,
      goal: allTigersTrapped,
      mode: 'achieve',
      maxPlies: 1,
      prompt: 'Trap the tiger in one move.',
    };

    const validation = verifyPuzzle(puzzle);
    expect(validation.solved).toBe(true);
    expect(validation.solutionCount).toBe(1);
    expect(validation.unique).toBe(true);
  });

  it('reports zero solutions for an unsolvable position', () => {
    const puzzle: Puzzle = {
      id: 'unsolvable',
      position: position([0], [1, 5, 2, 10, 12], { turn: GOAT }),
      solver: GOAT,
      goal: trapsAtLeast(2),
      mode: 'achieve',
      maxPlies: 1,
      prompt: 'Trap two tigers.',
    };

    const validation = verifyPuzzle(puzzle);
    expect(validation.solved).toBe(false);
    expect(validation.solutionCount).toBe(0);
    expect(validation.unique).toBe(false);
  });
});

describe('search hygiene', () => {
  it('leaves the caller position untouched', () => {
    const original = position([0], [1], { turn: TIGER });
    const snapshot = Int8Array.from(original.board);

    solvePuzzle({
      id: 'capture-1',
      position: original,
      solver: TIGER,
      goal: capturesAtLeast(1),
      mode: 'achieve',
      maxPlies: 3,
      prompt: 'Capture a goat.',
    });

    expect(Array.from(original.board)).toEqual(Array.from(snapshot));
    expect(original.goatsCaptured).toBe(0);
  });
});
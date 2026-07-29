import { PUZZLES } from '../../content/puzzles';
import { solvePuzzle, verifyPuzzle } from '../puzzle';

describe('authored puzzle set', () => {
  it('has no duplicate ids', () => {
    const ids = PUZZLES.map((puzzle) => puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Every puzzle is proved by the same search that will solve it at
  // runtime, so a position that does not actually work fails here rather
  // than in front of a user.
  describe.each(PUZZLES.map((puzzle) => [puzzle.id, puzzle] as const))(
    '%s',
    (_id, puzzle) => {
      it('has a forced solution within its ply budget', () => {
        const solution = solvePuzzle(puzzle);
        expect(solution.solved).toBe(true);
        expect(solution.line.length).toBeGreaterThan(0);
        expect(solution.line.length).toBeLessThanOrEqual(puzzle.maxPlies);
      });

      it('starts from a position where the goal does not already hold', () => {
        if (puzzle.mode === 'achieve') {
          expect(puzzle.goal(puzzle.position)).toBe(false);
        } else {
          expect(puzzle.goal(puzzle.position)).toBe(true);
        }
      });

      it('is solved by the expected number of first moves', () => {
        const validation = verifyPuzzle(puzzle);
        expect(validation.solved).toBe(true);
        if (puzzle.expectUnique) {
          expect(validation.solutionCount).toBe(1);
        } else {
          expect(validation.solutionCount).toBeGreaterThan(1);
        }
      });
    },
  );
});

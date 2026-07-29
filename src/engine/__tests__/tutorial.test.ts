import { TUTORIAL } from '../../content/tutorial';
import { applyMove, cloneState, generateMoves, undoMove } from '../moves';

describe('tutorial steps', () => {
  it('has no duplicate ids', () => {
    const ids = TUTORIAL.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(TUTORIAL.map((step) => [step.id, step] as const))('%s', (_id, step) => {
    it('starts from a position with at least one legal move', () => {
      expect(generateMoves(step.position).length).toBeGreaterThan(0);
    });

    // Without this, a lesson whose requirement no legal move can satisfy
    // would strand the learner with no way to continue.
    it('can be satisfied by some legal move', () => {
      if (!step.requires) return;

      const state = cloneState(step.position);
      const satisfying = generateMoves(state).filter((move) => {
        applyMove(state, move);
        const ok = step.requires!.accepts(move, state);
        undoMove(state, move);
        return ok;
      });

      expect(satisfying.length).toBeGreaterThan(0);
    });
  });
});

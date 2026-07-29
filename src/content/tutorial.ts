import { GOAT, TIGER, idx } from '../engine/board';
import { GameState, Move } from '../engine/moves';
import { noGoatEnPrise, trapsAtLeast } from '../engine/puzzle';
import { position } from './puzzles';

/**
 * A fixed, ordered sequence of short lessons. Deliberately not adaptive:
 * the rules have a natural teaching order, and the adaptive component of
 * this project belongs to the puzzle module, which has a skill model to
 * drive it. Progress here is linear and simply recorded.
 *
 * Several later steps reuse positions that also appear in the puzzle set.
 * That is intentional — the idea is taught here and then tested there.
 */

export interface StepRequirement {
  /** Instruction shown above the board. */
  prompt: string;
  /** Whether the move the user played is the one being taught. */
  accepts: (move: Move, next: GameState) => boolean;
  /** Shown when the user asks for help or plays something else. */
  hint: string;
}

export interface TutorialStep {
  id: string;
  title: string;
  /** Explanation shown before the board. */
  body: string;
  position: GameState;
  /** null for a read-only step advanced with Continue. */
  requires: StepRequirement | null;
}

const CORNERS = [idx(0, 0), idx(0, 4), idx(4, 0), idx(4, 4)] as const;

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'the-board',
    title: 'The board',
    body:
      'Bagh Chal is played on 25 points where the lines cross. Pieces move along ' +
      'the lines only. Four tigers start on the corners. Twenty goats are not on ' +
      'the board yet — they arrive one at a time.',
    position: position(CORNERS, [], { turn: GOAT }),
    requires: null,
  },
  {
    id: 'placing-a-goat',
    title: 'Placing goats',
    body:
      'Goats move first, and for the first twenty turns they do not move at all — ' +
      'they are placed, one per turn, on any empty point. Only once all twenty are ' +
      'down may they begin to slide.',
    position: position(CORNERS, [], { turn: GOAT }),
    requires: {
      prompt: 'Tap any empty point to place your first goat.',
      accepts: (move) => move.kind === 'place',
      hint: 'Any empty point is legal here. The corners are occupied by tigers.',
    },
  },
  {
    id: 'tigers-slide',
    title: 'How tigers move',
    body:
      'A tiger slides one step along a line to an adjacent empty point. Note that ' +
      'diagonals exist only at some points: if no diagonal line is drawn through a ' +
      'point, a piece cannot move diagonally from it.',
    position: position(CORNERS, [idx(0, 2), idx(2, 2), idx(4, 2)], { turn: TIGER }),
    requires: {
      prompt: 'Tap a tiger, then an empty point next to it.',
      accepts: (move) => move.kind === 'slide',
      hint: 'Tap any tiger first. Its legal destinations will be marked.',
    },
  },
  {
    id: 'tigers-capture',
    title: 'How tigers capture',
    body:
      'A tiger captures by jumping in a straight line over a single adjacent goat, ' +
      'landing on the empty point immediately beyond. Tigers win once five goats ' +
      'have been taken, so a goat left next to a tiger with a gap behind it is lost.',
    position: position(CORNERS, [idx(0, 1)], { turn: TIGER }),
    requires: {
      prompt: 'Play the capture.',
      accepts: (move) => move.kind === 'jump',
      hint: 'The corner tiger can jump the goat and land on the point beyond it.',
    },
  },
  {
    id: 'blocking',
    title: 'Defending a goat',
    body:
      'A goat cannot be taken if there is nowhere for the tiger to land. Filling ' +
      'the landing point is therefore just as good a defence as moving the goat ' +
      'away — and during the placement phase it is the only defence available.',
    position: position(CORNERS, [idx(0, 1), idx(2, 2)], { turn: GOAT }),
    requires: {
      prompt: 'Place a goat so that no goat can be captured next move.',
      accepts: (_move, next) => noGoatEnPrise(next),
      hint: 'Block the point the tiger would land on.',
    },
  },
  {
    id: 'trapping',
    title: 'How goats win',
    body:
      'Goats never capture. They win by taking away every tiger move: a tiger with ' +
      'no slide and no jump available is trapped, and when all four are trapped at ' +
      'once the goats have won. Corners are the easiest place to start.',
    position: position(
      CORNERS,
      [idx(0, 1), idx(1, 0), idx(1, 1), idx(2, 0), idx(2, 2)],
      { turn: GOAT },
    ),
    requires: {
      prompt: 'Place the goat that leaves the corner tiger with no move at all.',
      accepts: (_move, next) => trapsAtLeast(1)(next),
      hint: 'The corner tiger has exactly one escape left. Fill it.',
    },
  },
];

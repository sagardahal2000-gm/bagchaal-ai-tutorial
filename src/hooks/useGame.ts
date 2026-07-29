import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

import { GOAT } from '../engine/board';
import {
  GameState,
  Move,
  Side,
  applyMove,
  cloneState,
  generateMoves,
  inPlacementPhase,
  initialState,
} from '../engine/moves';
import { Outcome, outcome } from '../engine/rules';
import { ZobristKey, hashKey, zobristHash } from '../engine/search';

/* ------------------------------------------------------------------ *
 * Repetition
 *
 * rules.outcome() never returns 'draw' — repetition needs history, which
 * a single position cannot carry. The interface counts it here.
 *
 * This threshold is deliberately NOT the one negamax uses. The search
 * scores the first recurrence on a path as a draw, because a side that
 * can force a position to recur once can force it again, so proving it
 * three times over only burns nodes. Three is the rule for claiming a
 * draw in a real game, which is what this module is deciding.
 * ------------------------------------------------------------------ */

const REPETITIONS_FOR_DRAW = 3;

/** Uses the engine's own hash, so the interface and the search cannot
 *  disagree about when two positions are the same one. */
function keyOf(state: GameState): string {
  return hashKey(zobristHash(state));
}

/* ------------------------------------------------------------------ */

export interface UseGameOptions {
  /** Side the human plays. The other side is driven by `chooseMove`. */
  humanSide?: Side;
  /**
   * Injected move chooser, normally wrapping search(). Injected rather
   * than imported so the tutorial can supply a scripted reply and tests
   * can supply a stub.
   *
   * `history` holds every position reached earlier in this game and
   * excludes `state` itself, which is what SearchOptions.history expects.
   */
  chooseMove: (state: GameState, history: ZobristKey[]) => Move | null;
  /** Minimum visible "thinking" pause, so the reply does not appear instant. */
  aiDelayMs?: number;
  /** How long the captured goat stays flashed. */
  captureFlashMs?: number;
}

export interface UseGameResult {
  state: GameState;
  status: Outcome;
  selected: number | null;
  legalTargets: number[];
  lastMove: { from?: number; to: number } | null;
  capturing: number | null;
  thinking: boolean;
  isHumanTurn: boolean;
  /** How many times the current position has now occurred. */
  repetitionCount: number;
  onPointPress: (point: number) => void;
  undo: () => void;
  reset: () => void;
}

export function useGame({
  humanSide = GOAT,
  chooseMove,
  aiDelayMs = 250,
  captureFlashMs = 450,
}: UseGameOptions): UseGameResult {
  const [state, setState] = useState<GameState>(() => initialState());
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from?: number; to: number } | null>(null);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);

  /**
   * One hash per ply, including the current position, oldest first.
   * Refs, because they must not drive rendering — but `ply` below is
   * state, so anything derived from them still recomputes on each move.
   */
  const snapshots = useRef<GameState[]>([]);
  const positions = useRef<ZobristKey[]>([zobristHash(initialState())]);
  const [ply, setPly] = useState(0);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const moves = useMemo(() => generateMoves(state), [state]);

  const repetitionCount = useMemo(() => {
    const key = keyOf(state);
    let count = 0;
    for (const hash of positions.current) if (hashKey(hash) === key) count++;
    return count;
    // `ply` is the dependency that makes this recompute; `state` alone
    // would be enough, but undo can restore an identical board.
  }, [state, ply]);

  const status: Outcome = useMemo(() => {
    if (repetitionCount >= REPETITIONS_FOR_DRAW) return 'draw';
    return outcome(state, moves);
  }, [repetitionCount, state, moves]);

  const isHumanTurn = state.turn === humanSide && status === 'ongoing' && !thinking;

  /** Distinct origins the side to move may pick up. Empty during placement. */
  const origins = useMemo(() => {
    const set = new Set<number>();
    for (const move of moves) if (move.kind !== 'place') set.add(move.from);
    return set;
  }, [moves]);

  /**
   * Targets for the current selection. During placement every empty point
   * is legal, which is 20+ dots — the screen may prefer to pass [] to the
   * board rather than render them all.
   */
  const legalTargets = useMemo(() => {
    if (inPlacementPhase(state) && state.turn === GOAT) {
      return moves.flatMap((move) => (move.kind === 'place' ? [move.to] : []));
    }
    if (selected === null) return [];
    return moves.flatMap((move) =>
      move.kind !== 'place' && move.from === selected ? [move.to] : [],
    );
  }, [moves, selected, state]);

  /* ---------------------------------------------------------------- *
   * Committing a move
   *
   * applyMove mutates in place, which is right for search and wrong for
   * React. Every commit clones first, so setState always receives a new
   * reference and the board actually re-renders.
   * ---------------------------------------------------------------- */

  const commit = useCallback(
    (from: GameState, move: Move) => {
      snapshots.current.push(cloneState(from));

      const next = cloneState(from);
      applyMove(next, move);
      positions.current.push(zobristHash(next));

      setState(next);
      setPly((n) => n + 1);
      setSelected(null);
      setLastMove(move.kind === 'place' ? { to: move.to } : { from: move.from, to: move.to });

      if (move.kind === 'jump') {
        setCapturing(move.over);
        setTimeout(() => {
          if (alive.current) setCapturing(null);
        }, captureFlashMs);
      }
    },
    [captureFlashMs],
  );

  /* ---------------------------------------------------------------- *
   * Input
   * ---------------------------------------------------------------- */

  const onPointPress = useCallback(
    (point: number) => {
      if (!isHumanTurn) return;

      // Placement commits on a single tap; there is nothing to pick up.
      if (inPlacementPhase(state) && state.turn === GOAT) {
        const move = moves.find((m) => m.kind === 'place' && m.to === point);
        if (move) commit(state, move);
        return;
      }

      if (selected === null) {
        if (origins.has(point)) setSelected(point);
        return;
      }

      if (point === selected) {
        setSelected(null);
        return;
      }

      // A (from, to) pair is unambiguous: slides land one step away, jumps
      // two, so they can never collide from the same origin.
      const move = moves.find(
        (m) => m.kind !== 'place' && m.from === selected && m.to === point,
      );
      if (move) {
        commit(state, move);
        return;
      }

      setSelected(origins.has(point) ? point : null);
    },
    [commit, isHumanTurn, moves, origins, selected, state],
  );

  /* ---------------------------------------------------------------- *
   * AI turn
   *
   * The human's move must paint before the search starts, or the two
   * appear together after a frozen frame and read as a bug. Deferring past
   * interactions lets the commit render first; the search is still
   * synchronous once it begins, so keep timeLimitMs bounded.
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (status !== 'ongoing' || state.turn === humanSide) return;

    setThinking(true);
    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(() => {
        if (cancelled || !alive.current) return;
        // Everything before the current position — SearchOptions.history
        // must not include `state` itself, or the root scores as a draw.
        const history = positions.current.slice(0, -1);
        const move = chooseMove(state, history);
        if (!cancelled && alive.current) {
          if (move) commit(state, move);
          setThinking(false);
        }
      }, aiDelayMs);
      return () => clearTimeout(timer);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [aiDelayMs, chooseMove, commit, humanSide, state, status]);

  /* ---------------------------------------------------------------- */

  const undo = useCallback(() => {
    // Step back past the AI reply to the human's own previous turn.
    let previous = snapshots.current.pop();
    positions.current.pop();
    while (previous && previous.turn !== humanSide && snapshots.current.length > 0) {
      previous = snapshots.current.pop();
      positions.current.pop();
    }
    if (!previous) return;

    setState(previous);
    setPly((n) => n + 1);
    setSelected(null);
    setLastMove(null);
    setCapturing(null);
  }, [humanSide]);

  const reset = useCallback(() => {
    const fresh = initialState();
    snapshots.current = [];
    positions.current = [zobristHash(fresh)];
    setState(fresh);
    setPly(0);
    setSelected(null);
    setLastMove(null);
    setCapturing(null);
    setThinking(false);
  }, []);

  return {
    state,
    status,
    selected,
    legalTargets,
    lastMove,
    capturing,
    thinking,
    isHumanTurn,
    repetitionCount,
    onPointPress,
    undo,
    reset,
  };
}

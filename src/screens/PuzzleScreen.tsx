import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BagchaalBoard from '../components/BagchaalBoard';
import {
  AuthoredPuzzle,
  PUZZLES,
  moveKeepsSolution,
  opponentReply,
  puzzleById,
} from '../content/puzzles';
import { GOAT } from '../engine/board';
import {
  RatedPuzzle,
  RatedUser,
  expectedScore,
  newUser,
  recordAttempt,
  selectPuzzle,
} from '../engine/elo';
import {
  GameState,
  Move,
  applyMove,
  cloneState,
  generateMoves,
  inPlacementPhase,
} from '../engine/moves';
import { solvePuzzle } from '../engine/puzzle';
import { clearProgress, loadProgress, mergeRatings, saveProgress } from '../storage/progress';

type Phase = 'solving' | 'solved' | 'failed';

/** Ratings start from the authored difficulty seeds and move from there. */
function seedRatings(): RatedPuzzle[] {
  return PUZZLES.map((puzzle) => ({ id: puzzle.id, rating: puzzle.rating, attempts: 0 }));
}

export default function PuzzleScreen() {
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<RatedUser>(() => newUser());
  const [ratings, setRatings] = useState<RatedPuzzle[]>(seedRatings);
  const [solvedIds, setSolvedIds] = useState<ReadonlySet<string>>(() => new Set());

  /** Until stored progress has been read, saving would overwrite it with
   *  defaults, and selecting a puzzle would use the wrong rating. */
  const [hydrated, setHydrated] = useState(false);

  const [current, setCurrent] = useState<AuthoredPuzzle | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [pliesUsed, setPliesUsed] = useState(0);
  const [phase, setPhase] = useState<Phase>('solving');

  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from?: number; to: number } | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  /* ---------------------------------------------------------------- *
   * Persistence
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    loadProgress().then((stored) => {
      if (cancelled) return;
      if (stored) {
        setUser(stored.user);
        setRatings(mergeRatings(seedRatings(), stored.ratings));
        setSolvedIds(new Set(stored.solvedIds));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveProgress({ user, ratings, solvedIds: [...solvedIds] });
  }, [hydrated, ratings, solvedIds, user]);

  /* ---------------------------------------------------------------- *
   * Puzzle selection
   * ---------------------------------------------------------------- */

  const loadNext = useCallback(() => {
    const rated = selectPuzzle(user, ratings, solvedIds);
    const puzzle = rated ? puzzleById(rated.id) : undefined;
    if (!puzzle) return;

    setCurrent(puzzle);
    setState(cloneState(puzzle.position));
    setPliesUsed(0);
    setPhase('solving');
    setSelected(null);
    setLastMove(null);
    setHint(null);
    setUsedHint(false);
    setFeedback(null);
  }, [ratings, solvedIds, user]);

  useEffect(() => {
    if (hydrated && !current) loadNext();
  }, [current, hydrated, loadNext]);

  /* ---------------------------------------------------------------- *
   * Derived board data
   * ---------------------------------------------------------------- */

  const moves = useMemo(() => (state ? generateMoves(state) : []), [state]);

  const origins = useMemo(() => {
    const set = new Set<number>();
    for (const move of moves) if (move.kind !== 'place') set.add(move.from);
    return set;
  }, [moves]);

  const isSolverTurn =
    !!state && !!current && state.turn === current.solver && phase === 'solving';

  const placing = !!state && inPlacementPhase(state) && state.turn === GOAT;

  const legalTargets = useMemo(() => {
    // A revealed hint takes over the highlight, so the user sees the
    // move rather than the whole set of options.
    if (hint) return [hint.to];
    if (!state || placing || selected === null) return [];
    return moves.flatMap((move) =>
      move.kind !== 'place' && move.from === selected ? [move.to] : [],
    );
  }, [hint, moves, placing, selected, state]);

  const hintOrigin = hint && hint.kind !== 'place' ? hint.from : null;

  /* ---------------------------------------------------------------- *
   * Scoring an attempt
   * ---------------------------------------------------------------- */

  const finish = useCallback(
    (didSolve: boolean, hintWasUsed: boolean) => {
      if (!current) return;
      const rated = ratings.find((r) => r.id === current.id);
      if (!rated) return;

      // A solve that needed a hint counts as half — it is evidence of
      // partial ability, not of none and not of full.
      const score = didSolve ? (hintWasUsed ? 0.5 : 1) : 0;
      const result = recordAttempt(user, rated, score);

      setUser(result.user);
      setRatings((all) => all.map((r) => (r.id === rated.id ? result.puzzle : r)));
      if (didSolve) setSolvedIds((ids) => new Set(ids).add(current.id));

      setPhase(didSolve ? 'solved' : 'failed');
      setFeedback(
        didSolve
          ? hintWasUsed
            ? 'Solved, with a hint ✔'
            : 'Solved ✔'
          : 'That move gives the solution away. Try again.',
      );
    },
    [current, ratings, user],
  );

  /* ---------------------------------------------------------------- *
   * Playing a move
   * ---------------------------------------------------------------- */

  const commit = useCallback(
    (move: Move) => {
      if (!state || !current) return;

      const next = cloneState(state);
      applyMove(next, move);

      const used = pliesUsed + 1;
      const remaining = current.maxPlies - used;

      setState(next);
      setPliesUsed(used);
      setSelected(null);
      setHint(null);
      setLastMove(move.kind === 'place' ? { to: move.to } : { from: move.from, to: move.to });

      // Correct means the position still admits a forced solution within
      // the plies that remain — verified by proof search, not compared
      // against a stored answer.
      if (!moveKeepsSolution(current, next, remaining)) {
        finish(false, usedHint);
        return;
      }

      if (current.mode === 'achieve' && current.goal(next)) {
        finish(true, usedHint);
        return;
      }

      if (remaining <= 0) {
        finish(current.mode === 'maintain', usedHint);
        return;
      }

      const reply = opponentReply(current, next, remaining);
      if (!reply) {
        finish(true, usedHint);
        return;
      }

      // Let the user's move paint before the opponent answers.
      setTimeout(() => {
        const after = cloneState(next);
        applyMove(after, reply);
        setState(after);
        setPliesUsed(used + 1);
        setLastMove(
          reply.kind === 'place' ? { to: reply.to } : { from: reply.from, to: reply.to },
        );
      }, 450);
    },
    [current, finish, pliesUsed, state, usedHint],
  );

  const onPointPress = useCallback(
    (point: number) => {
      if (!state || !isSolverTurn) return;

      if (placing) {
        const move = moves.find((m) => m.kind === 'place' && m.to === point);
        if (move) commit(move);
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

      const move = moves.find(
        (m) => m.kind !== 'place' && m.from === selected && m.to === point,
      );
      if (move) commit(move);
      else setSelected(origins.has(point) ? point : null);
    },
    [commit, isSolverTurn, moves, origins, placing, selected, state],
  );

  /* ---------------------------------------------------------------- */

  const showHint = useCallback(() => {
    if (!state || !current) return;
    const remaining = current.maxPlies - pliesUsed;
    const solution = solvePuzzle({ ...current, position: state, maxPlies: remaining });
    const first = solution.line[0];
    if (!first) return;
    setHint(first);
    setUsedHint(true);
    setSelected(null);
  }, [current, pliesUsed, state]);

  const retry = useCallback(() => {
    if (!current) return;
    setState(cloneState(current.position));
    setPliesUsed(0);
    setPhase('solving');
    setSelected(null);
    setLastMove(null);
    setHint(null);
    setFeedback(null);
  }, [current]);

  /** Wipes stored progress and starts over — useful for demonstrating
   *  adaptive selection from a fresh rating. */
  const resetProgress = useCallback(async () => {
    await clearProgress();
    setUser(newUser());
    setRatings(seedRatings());
    setSolvedIds(new Set());
    setCurrent(null);
  }, []);

  /* ---------------------------------------------------------------- */

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.title}>Puzzles</Text>
          <Text style={styles.muted}>Loading your progress…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!current || !state) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.title}>Puzzles</Text>
          <Text style={styles.muted}>No puzzles available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rated = ratings.find((r) => r.id === current.id);
  const chance = rated ? Math.round(expectedScore(user.rating, rated.rating) * 100) : 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Puzzles</Text>
          <Pressable onPress={resetProgress} hitSlop={8}>
            <Text style={styles.reset}>Reset progress</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(user.rating)}</Text>
            <Text style={styles.statLabel}>Your rating</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{rated ? Math.round(rated.rating) : '—'}</Text>
            <Text style={styles.statLabel}>Puzzle rating</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{chance}%</Text>
            <Text style={styles.statLabel}>Predicted solve</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {solvedIds.size}/{PUZZLES.length}
            </Text>
            <Text style={styles.statLabel}>Solved</Text>
          </View>
        </View>

        <Text style={styles.prompt}>{current.prompt}</Text>

        <View style={styles.boardWrap}>
          <BagchaalBoard
            board={state.board}
            selected={hintOrigin ?? selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            disabled={!isSolverTurn}
            onPointPress={onPointPress}
          />
        </View>

        <View style={styles.messageRow}>
          {feedback ? (
            <Text style={[styles.message, phase === 'failed' && styles.messageBad]}>
              {feedback}
            </Text>
          ) : (
            <Text style={styles.muted}>
              {placing ? 'Tap a point to place a goat' : 'Tap a piece, then its destination'}
            </Text>
          )}
        </View>

        <View style={[styles.actions, { marginBottom: 16 + insets.bottom }]}>
          {phase === 'solving' ? (
            <Pressable onPress={showHint} style={styles.action}>
              <Text style={styles.actionLabel}>Hint</Text>
            </Pressable>
          ) : (
            <Pressable onPress={retry} style={styles.action}>
              <Text style={styles.actionLabel}>Retry</Text>
            </Pressable>
          )}
          <Pressable
            onPress={loadNext}
            style={[styles.action, phase === 'solved' && styles.actionPrimary]}
          >
            <Text
              style={[styles.actionLabel, phase === 'solved' && styles.actionLabelPrimary]}
            >
              Next puzzle
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const PALETTE = {
  background: '#FBF7F0',
  surface: '#FFFFFF',
  ink: '#33291F',
  muted: '#8A7A66',
  accent: '#2E7D62',
  bad: '#C4402A',
  border: '#E4DACB',
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '700', color: PALETTE.ink },
  reset: { fontSize: 13, color: PALETTE.muted, textDecorationLine: 'underline' },
  muted: { fontSize: 14, color: PALETTE.muted },

  statusRow: {
    flexDirection: 'row',
    backgroundColor: PALETTE.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PALETTE.border,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '600', color: PALETTE.ink },
  statLabel: { fontSize: 10, color: PALETTE.muted, marginTop: 2, textAlign: 'center' },

  prompt: { fontSize: 15, color: PALETTE.ink, lineHeight: 21 },
  boardWrap: { flex: 1, minHeight: 300 },

  messageRow: { minHeight: 26, justifyContent: 'center', alignItems: 'center' },
  message: { fontSize: 15, fontWeight: '600', color: PALETTE.accent, textAlign: 'center' },
  messageBad: { color: PALETTE.bad },

  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  action: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
  actionLabel: { fontSize: 15, fontWeight: '600', color: PALETTE.ink },
  actionLabelPrimary: { color: '#FFFFFF' },
});

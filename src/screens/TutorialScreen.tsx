import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BagchaalBoard from '../components/BagchaalBoard';
import { LESSONS, TUTORIAL, lessonById, stepsInLesson } from '../content/tutorial';
import { GOAT } from '../engine/board';
import {
  GameState,
  Move,
  applyMove,
  cloneState,
  generateMoves,
  inPlacementPhase,
} from '../engine/moves';
import { loadTutorialStep, saveTutorialStep } from '../storage/tutorial';

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  /** Lesson id whose completion card is currently showing. */
  const [celebrating, setCelebrating] = useState<string | null>(null);

  const [state, setState] = useState<GameState>(() => cloneState(TUTORIAL[0].position));
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from?: number; to: number } | null>(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const finished = index >= TUTORIAL.length;
  const step = TUTORIAL[Math.min(index, TUTORIAL.length - 1)];
  const lesson = lessonById(step.lessonId);

  /** Steps completed over steps total. */
  const percent = Math.round((Math.min(index, TUTORIAL.length) / TUTORIAL.length) * 100);

  /* ---------------------------------------------------------------- *
   * Persistence
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    loadTutorialStep().then((stored) => {
      if (cancelled) return;
      const safe = Math.min(stored, TUTORIAL.length);
      setIndex(safe);
      if (safe < TUTORIAL.length) setState(cloneState(TUTORIAL[safe].position));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) saveTutorialStep(index);
  }, [hydrated, index]);

  /* ---------------------------------------------------------------- *
   * Step transitions
   * ---------------------------------------------------------------- */

  const goTo = useCallback((next: number) => {
    setIndex(next);
    setSelected(null);
    setLastMove(null);
    setDone(false);
    setMessage(null);
    if (next < TUTORIAL.length) setState(cloneState(TUTORIAL[next].position));
  }, []);

  /**
   * Advance, and raise a completion card when the next step belongs to a
   * different lesson. The index moves first, so progress is persisted
   * even if the card is dismissed by closing the app.
   */
  const advance = useCallback(() => {
    const nextIndex = index + 1;
    const currentLesson = TUTORIAL[index].lessonId;
    const nextLesson =
      nextIndex < TUTORIAL.length ? TUTORIAL[nextIndex].lessonId : null;

    goTo(nextIndex);
    if (nextLesson !== currentLesson) setCelebrating(currentLesson);
  }, [goTo, index]);

  /* ---------------------------------------------------------------- *
   * Board interaction
   * ---------------------------------------------------------------- */

  const moves = useMemo(() => generateMoves(state), [state]);

  const origins = useMemo(() => {
    const set = new Set<number>();
    for (const move of moves) if (move.kind !== 'place') set.add(move.from);
    return set;
  }, [moves]);

  const placing = inPlacementPhase(state) && state.turn === GOAT;
  const interactive = !finished && !celebrating && !!step.requires && !done;

  const legalTargets = useMemo(() => {
    if (!interactive || placing || selected === null) return [];
    return moves.flatMap((move) =>
      move.kind !== 'place' && move.from === selected ? [move.to] : [],
    );
  }, [interactive, moves, placing, selected]);

  const attempt = useCallback(
    (move: Move) => {
      if (!step.requires) return;

      const next = cloneState(state);
      applyMove(next, move);

      setLastMove(move.kind === 'place' ? { to: move.to } : { from: move.from, to: move.to });
      setSelected(null);

      if (step.requires.accepts(move, next)) {
        setState(next);
        setDone(true);
        setMessage('That is it ✔');
        return;
      }

      // Show the attempted move briefly, then restore the position so the
      // lesson can be retried from the same starting point.
      setState(next);
      setMessage(`Not this one. ${step.requires.hint}`);
      setTimeout(() => {
        setState(cloneState(step.position));
        setLastMove(null);
      }, 900);
    },
    [state, step],
  );

  const onPointPress = useCallback(
    (point: number) => {
      if (!interactive) return;

      if (placing) {
        const move = moves.find((m) => m.kind === 'place' && m.to === point);
        if (move) attempt(move);
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
      if (move) attempt(move);
      else setSelected(origins.has(point) ? point : null);
    },
    [attempt, interactive, moves, origins, placing, selected],
  );

  /* ---------------------------------------------------------------- *
   * Screens
   * ---------------------------------------------------------------- */

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <Text style={styles.title}>Learn Bagh Chal</Text>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (celebrating) {
    const completed = lessonById(celebrating);
    const number = LESSONS.findIndex((l) => l.id === celebrating) + 1;
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={[styles.container, styles.centred]}>
          <Text style={styles.tick}>✓</Text>
          <Text style={styles.cardTitle}>Lesson {number} complete</Text>
          <Text style={styles.cardLesson}>{completed?.title}</Text>
          <Text style={styles.body}>{completed?.summary}</Text>

          <ProgressBar percent={percent} />

          <Pressable
            onPress={() => setCelebrating(null)}
            style={[styles.action, styles.actionPrimary, { marginTop: 60, marginBottom: 60, maxHeight: 50, }]}
          >
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
              {index >= TUTORIAL.length ? 'Finish' : 'Next lesson'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={[styles.container, styles.centred]}>
          <Text style={styles.tick}>✔</Text>
          <Text style={styles.cardTitle}>All lessons complete</Text>
          <Text style={styles.body}>
            You know the rules: placement, sliding, capture by jumping, blocking a
            landing point, trapping tigers, and both ways a game ends. The puzzles are
            the place to practise them under pressure.
          </Text>
          <ProgressBar percent={100} />
          <Pressable
            onPress={() => goTo(0)}
            style={[styles.action, { marginTop: 40, marginBottom: 40, maxHeight: 50, }]}
          >
            <Text style={styles.actionLabel}>Start again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canAdvance = !step.requires || done;
  const lessonNumber = LESSONS.findIndex((l) => l.id === step.lessonId) + 1;
  const withinLesson =
    stepsInLesson(step.lessonId).findIndex((s) => s.id === step.id) + 1;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>
          Lesson {lessonNumber} · {lesson?.title} · step {withinLesson} of{' '}
          {stepsInLesson(step.lessonId).length}
        </Text>

        <ProgressBar percent={percent} />

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        {step.requires ? <Text style={styles.prompt}>{step.requires.prompt}</Text> : null}

        <View style={styles.boardWrap}>
          <BagchaalBoard
            board={state.board}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            disabled={!interactive}
            onPointPress={onPointPress}
          />
        </View>

        <View style={styles.messageRow}>
          {message ? (
            <Text style={[styles.message, !done && styles.messageBad]}>{message}</Text>
          ) : null}
        </View>

        <View style={[styles.actions, { marginBottom: 12 + insets.bottom / 2 }]}>
          {index > 0 ? (
            <Pressable onPress={() => goTo(index - 1)} style={styles.action}>
              <Text style={styles.actionLabel}>Back</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={advance}
            disabled={!canAdvance}
            style={[
              styles.action,
              canAdvance ? styles.actionPrimary : styles.actionDisabled,
            ]}
          >
            <Text style={[styles.actionLabel, canAdvance && styles.actionLabelPrimary]}>
              {index === TUTORIAL.length - 1 ? 'Finish' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.percent}>{percent}%</Text>
    </View>
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
  container: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  centred: { flex: 1, justifyContent: 'center' },

  eyebrow: { fontSize: 12, color: PALETTE.muted, letterSpacing: 0.3 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: PALETTE.border,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: PALETTE.accent },
  percent: { fontSize: 12, fontWeight: '600', color: PALETTE.accent, minWidth: 36 },

  title: { fontSize: 23, fontWeight: '700', color: PALETTE.ink },
  body: { fontSize: 15, color: PALETTE.ink, lineHeight: 22 },
  prompt: { fontSize: 15, fontWeight: '600', color: PALETTE.accent, lineHeight: 21 },
  muted: { fontSize: 14, color: PALETTE.muted },

  tick: { fontSize: 44, color: PALETTE.accent, textAlign: 'center' },
  cardTitle: { fontSize: 24, fontWeight: '700', color: PALETTE.ink, textAlign: 'center' },
  cardLesson: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.accent,
    textAlign: 'center',
  },

  boardWrap: { width: '100%', aspectRatio: 1 },

  messageRow: { minHeight: 40, justifyContent: 'center' },
  message: { fontSize: 14, fontWeight: '600', color: PALETTE.accent, lineHeight: 20 },
  messageBad: { color: PALETTE.bad },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
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
  actionDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 15, fontWeight: '600', color: PALETTE.ink },
  actionLabelPrimary: { color: '#FFFFFF',  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BagchaalBoard from '../components/BagchaalBoard';
import { TUTORIAL } from '../content/tutorial';
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

  const step = TUTORIAL[Math.min(index, TUTORIAL.length - 1)];
  const finished = index >= TUTORIAL.length;

  const [state, setState] = useState<GameState>(() => cloneState(TUTORIAL[0].position));
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from?: number; to: number } | null>(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const restartStep = useCallback(() => {
    setState(cloneState(step.position));
    setSelected(null);
    setLastMove(null);
    setDone(false);
    setMessage(null);
  }, [step]);

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
  const interactive = !finished && !!step.requires && !done;

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
        setMessage('That is it.');
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

  /* ---------------------------------------------------------------- */

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.title}>Learn Bagh Chal</Text>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.title}>Lessons complete</Text>
          <Text style={styles.body}>
            You know the rules: placement, sliding, capture by jumping, blocking a
            landing point, and trapping tigers. The puzzles are the place to practise
            them under pressure.
          </Text>
          <View style={[styles.actions, { marginBottom: 16 + insets.bottom }]}>
            <Pressable onPress={() => goTo(0)} style={styles.action}>
              <Text style={styles.actionLabel}>Start again</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const canAdvance = !step.requires || done;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.stepCount}>
          Step {index + 1} of {TUTORIAL.length}
        </Text>

        <View style={styles.dots}>
          {TUTORIAL.map((lesson, i) => (
            <View
              key={lesson.id}
              style={[
                styles.dot,
                i < index && styles.dotDone,
                i === index && styles.dotCurrent,
              ]}
            />
          ))}
        </View>

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

        <View style={[styles.actions, { marginBottom: 16 + insets.bottom }]}>
          {index > 0 ? (
            <Pressable onPress={() => goTo(index - 1)} style={styles.action}>
              <Text style={styles.actionLabel}>Back</Text>
            </Pressable>
          ) : null}

          {step.requires && !done ? (
            <Pressable onPress={restartStep} style={styles.action}>
              <Text style={styles.actionLabel}>Reset</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => goTo(index + 1)}
            disabled={!canAdvance}
            style={[
              styles.action,
              canAdvance ? styles.actionPrimary : styles.actionDisabled,
            ]}
          >
            <Text
              style={[styles.actionLabel, canAdvance && styles.actionLabelPrimary]}
            >
              {index === TUTORIAL.length - 1 ? 'Finish' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
  container: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },

  stepCount: { fontSize: 12, color: PALETTE.muted, letterSpacing: 0.5 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: PALETTE.border,
  },
  dotDone: { backgroundColor: PALETTE.accent, opacity: 0.45 },
  dotCurrent: { backgroundColor: PALETTE.accent },

  title: { fontSize: 24, fontWeight: '700', color: PALETTE.ink },
  body: { fontSize: 15, color: PALETTE.ink, lineHeight: 22 },
  prompt: { fontSize: 15, fontWeight: '600', color: PALETTE.accent, lineHeight: 21 },
  muted: { fontSize: 14, color: PALETTE.muted },

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
  actionLabelPrimary: { color: '#FFFFFF' },
});

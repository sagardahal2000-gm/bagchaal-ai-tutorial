import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BagchaalBoard from '../components/BagchaalBoard';
import { GOAT, GOATS_TO_LOSE, TIGER, TOTAL_GOATS } from '../engine/board';
import { GameState, Move, Side, inPlacementPhase } from '../engine/moves';
import { Outcome } from '../engine/rules';
import { ZobristKey, search } from '../engine/search';
import { useGame } from '../hooks/useGame';

/** Bounded so the synchronous search cannot stall the UI thread for long. */
const AI_TIME_LIMIT_MS = 400;
const AI_MAX_DEPTH = 6;

function resultText(status: Outcome, state: GameState): string | null {
  switch (status) {
    case 'ongoing':
      return null;
    case 'draw':
      return 'Draw by repetition';
    case 'tigers-win':
      return state.goatsCaptured >= GOATS_TO_LOSE
        ? `Tigers win — ${GOATS_TO_LOSE} goats captured`
        : 'Tigers win — the goats have no legal move';
    case 'goats-win':
      return 'Goats win — every tiger is trapped';
  }
}

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const [humanSide, setHumanSide] = useState<Side>(GOAT);

  /**
   * Stable identity matters: the hook's AI effect depends on chooseMove,
   * so an inline arrow would give it a new identity every render and
   * re-fire the search.
   */
  const chooseMove = useCallback(
    (state: GameState, history: ZobristKey[]) =>
      search(state, {
        timeLimitMs: AI_TIME_LIMIT_MS,
        maxDepth: AI_MAX_DEPTH,
        history,
      }).bestMove,
    [],
  );

  const game = useGame({ humanSide, chooseMove });

  const [suggestion, setSuggestion] = useState<Move | null>(null);

  // A suggestion describes one position only, so it dies with it.
  useEffect(() => setSuggestion(null), [game.state]);

  const suggest = useCallback(() => {
    if (!game.isHumanTurn) return;
    const result = search(game.state, {
      timeLimitMs: AI_TIME_LIMIT_MS,
      maxDepth: AI_MAX_DEPTH,
      history: game.getHistory(),
    });
    setSuggestion(result.bestMove);
  }, [game]);

  const switchSide = useCallback(
    (side: Side) => {
      if (side === humanSide) return;
      setHumanSide(side);
      game.reset();
    },
    [game, humanSide],
  );

  const placement = inPlacementPhase(game.state);
  const banner = resultText(game.status, game.state);
  const suggestionOrigin =
    suggestion && suggestion.kind !== 'place' ? suggestion.from : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.container, { paddingBottom: 8 + insets.bottom / 2 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Bagh Chaal</Text>
          <View style={styles.phasePill}>
            <Text style={styles.phaseText}>{'Phase: ' + (placement ? 'placement' : 'sliding')}</Text>
          </View>
        </View>

        {/* Switching side restarts, since the AI would otherwise be left
            mid-game on the side the player just took over. */}
        <View style={styles.sideRow}>
          {([GOAT, TIGER] as Side[]).map((side) => {
            const active = side === humanSide;
            return (
              <Pressable
                key={side}
                onPress={() => switchSide(side)}
                style={[styles.sideButton, active && styles.sideButtonActive]}
              >
                <Text style={[styles.sideLabel, active && styles.sideLabelActive]}>
                  {side === GOAT ? 'Goats' : 'Tigers'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.statusRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {game.state.goatsPlaced}/{TOTAL_GOATS}
            </Text>
            <Text style={styles.statLabel}>Goats placed</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {game.state.goatsCaptured}/{GOATS_TO_LOSE}
            </Text>
            <Text style={styles.statLabel}>Goats captured</Text>
          </View>
        </View>

        <View style={styles.boardWrap}>
          <BagchaalBoard
            board={game.state.board}
            selected={suggestionOrigin ?? game.selected}
            legalTargets={
              suggestion
                ? [suggestion.to]
                : placement && game.state.turn === GOAT
                  ? []
                  : game.legalTargets
            }
            lastMove={game.lastMove}
            capturing={game.capturing}
            disabled={!game.isHumanTurn}
            onPointPress={game.onPointPress}
          />
        </View>

        <View style={styles.turnRow}>
          {banner ? (
            <Text style={styles.banner}>{banner}</Text>
          ) : game.thinking ? (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={PALETTE.accent} />
              <Text style={styles.turnText}>Thinking…</Text>
            </View>
          ) : (
            <Text style={styles.turnText}>
              {game.isHumanTurn
                ? placement && game.state.turn === GOAT
                  ? 'Tap an empty point to place a goat'
                  : 'Tap a piece, then where to move it'
                : 'Waiting…'}
            </Text>
          )}
        </View>

        {game.repetitionCount > 1 && game.status === 'ongoing' ? (
          <Text style={styles.warning}>
            This position has occurred {game.repetitionCount} times
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={suggest}
            disabled={!game.isHumanTurn}
            style={[styles.action, !game.isHumanTurn && styles.actionDisabled]}
          >
            <Text style={styles.actionLabel}>
              {suggestion ? 'Shown' : 'Suggest'}
            </Text>
          </Pressable>
          <Pressable
            onPress={game.undo}
            disabled={game.thinking}
            style={[styles.action, game.thinking && styles.actionDisabled]}
          >
            <Text style={styles.actionLabel}>Undo</Text>
          </Pressable>
          <Pressable onPress={game.reset} style={[styles.action, styles.actionPrimary]}>
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>New game</Text>
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
  border: '#E4DACB',
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: PALETTE.ink },
  phasePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  phaseText: { fontSize: 12, fontWeight: '600', color: PALETTE.muted },

  sideRow: { flexDirection: 'row', gap: 8 },
  sideButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.border,
    alignItems: 'center',
  },
  sideButtonActive: { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
  sideLabel: { fontSize: 13, color: PALETTE.muted },
  sideLabelActive: { color: '#FFFFFF', fontWeight: '600' },

  statusRow: {
    flexDirection: 'row',
    backgroundColor: PALETTE.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PALETTE.border,
    paddingVertical: 8,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '600', color: PALETTE.ink },
  statLabel: { fontSize: 11, color: PALETTE.muted, marginTop: 2 },

  /* Flexes to fill whatever room is left. The SVG preserves its own
     aspect ratio and centres itself, so no fixed square is needed. */
  boardWrap: { flex: 1, minHeight: 200 },

  turnRow: { minHeight: 24, justifyContent: 'center', alignItems: 'center' },
  turnText: { fontSize: 14, color: PALETTE.muted },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { fontSize: 16, fontWeight: '700', color: PALETTE.ink, textAlign: 'center' },
  warning: { fontSize: 12, color: PALETTE.muted, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: PALETTE.accent, borderColor: PALETTE.accent },
  actionDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: PALETTE.ink },
  actionLabelPrimary: { color: '#FFFFFF' },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Link } from 'expo-router';
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
  const [humanSide, setHumanSide] = useState<Side>(GOAT);

  /**
   * Stable identity matters: the hook's AI effect depends on chooseMove,
   * so an inline arrow would give it a new identity every render and
   * re-fire the search.
   *
   * The state is cloned before it goes in. negamax applies and undoes
   * moves on the object it is given and restores it on the way out, so
   * this is not strictly necessary — but it costs 25 bytes and removes
   * the question entirely.
   */
  const chooseMove = useCallback(
  (state: GameState, history: ZobristKey[]) => {
    const result = search(state, {
      timeLimitMs: AI_TIME_LIMIT_MS,
      maxDepth: AI_MAX_DEPTH,
      history,
    });
    //console.log(`depth ${result.depth} · ${result.nodes} nodes · ${result.timeMs}ms`);
    return result.bestMove;
  },
  [],
);

  const game = useGame({ humanSide, chooseMove });

  const [suggestion, setSuggestion] = useState<Move | null>(null);

  // The suggestion describes one position only, so it dies with it.
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

  const suggestionOrigin =
    suggestion && suggestion.kind !== 'place' ? suggestion.from : null;

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
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Bagh Chal</Text>

        {/* Side selector. Switching restarts, since the AI would otherwise
            be left mid-game on the side the player just took over. */}
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
                  Play as {side === GOAT ? 'Goats' : 'Tigers'}
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
          <View style={styles.stat}>
            <Text style={styles.statValue}>{placement ? 'Placement' : 'Sliding'}</Text>
            <Text style={styles.statLabel}>Phase</Text>
          </View>
        </View>

        <View style={styles.boardWrap}>
          <BagchaalBoard
            board={game.state.board}
            selected={suggestionOrigin ?? game.selected}
            //During the placement phase, the legal targets are all empty points. It is not practical to pass them all to the board, 
            // so the board is told to render no targets. The board will still accept taps on empty points and pass them to onPointPress.
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
        
        <Link href="/puzzles" style={{ textAlign: 'center', color: '#2E7D62', fontSize: 15 }}>
          Puzzles →
        </Link>

        <Link href="/tutorial" style={{ textAlign: 'center', color: '#2E7D62', fontSize: 15 }}>
          Learn the rules →
        </Link>

        <View style={styles.suggestRow}>
          <Pressable
            onPress={suggest}
            disabled={!game.isHumanTurn}
            style={[styles.action, !game.isHumanTurn && styles.actionDisabled]}
          >
            <Text style={styles.actionLabel}>
              {suggestion ? 'Suggestion shown' : 'Suggest a move'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.actions, { marginBottom: 16 + insets.bottom }]}>
          <Pressable
            onPress={game.undo}
            disabled={game.thinking}
            style={[styles.action, game.thinking && styles.actionDisabled]}
          >
            <Text style={styles.actionLabel}>Undo</Text>
          </Pressable>
          <Pressable onPress={game.reset} style={styles.action}>
            <Text style={styles.actionLabel}>New game</Text>
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
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  title: { fontSize: 26, fontWeight: '700', color: PALETTE.ink },

  sideRow: { flexDirection: 'row', gap: 8 },
  sideButton: {
    flex: 1,
    paddingVertical: 8,
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
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '600', color: PALETTE.ink },
  statLabel: { fontSize: 11, color: PALETTE.muted, marginTop: 2 },

  boardWrap: { width: '100%', aspectRatio: 1 },

  turnRow: { minHeight: 28, justifyContent: 'center', alignItems: 'center' },
  turnText: { fontSize: 14, color: PALETTE.muted },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { fontSize: 16, fontWeight: '700', color: PALETTE.ink, textAlign: 'center' },
  warning: { fontSize: 12, color: PALETTE.muted, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto', marginBottom: 16 },
  action: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
  },
  actionDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 15, fontWeight: '600', color: PALETTE.ink },
  suggestRow: { flexDirection: 'row' },
});

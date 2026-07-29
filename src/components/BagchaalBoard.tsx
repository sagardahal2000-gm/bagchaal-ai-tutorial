import React, { useMemo } from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';

import {
  ADJACENCY,
  EMPTY,
  POINTS,
  TIGER,
  colOf,
  rowOf,
} from '../engine/board';

/* ------------------------------------------------------------------ *
 * Geometry
 *
 * A fixed viewBox keeps every coordinate an integer and lets SVG do the
 * device-pixel mapping. Points sit at 10/30/50/70/90 on both axes.
 * ------------------------------------------------------------------ */

const MARGIN = 10;
const UNIT = 20;
const EXTENT = MARGIN * 2 + UNIT * (5 - 1); // 100

/** X coordinate of point `i` in viewBox units. Exported for overlays. */
export function xOf(i: number): number {
  return MARGIN + colOf(i) * UNIT;
}

/** Y coordinate of point `i` in viewBox units. Exported for overlays. */
export function yOf(i: number): number {
  return MARGIN + rowOf(i) * UNIT;
}

/**
 * Undirected edge list, built once from ADJACENCY. The `j > i` guard is
 * what stops every line being drawn twice; there are 56 edges, not 112.
 *
 * Deriving the lines from ADJACENCY rather than hardcoding them means the
 * board the player sees and the moves the engine generates cannot disagree.
 */
const EDGES: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < POINTS; i++) {
    for (const j of ADJACENCY[i]) {
      if (j > i) out.push([i, j]);
    }
  }
  return out;
})();

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

const COLOR = {
  line: '#8A7A66',
  point: '#6B5C4A',
  goat: '#F2EDE4',
  goatEdge: '#6B5C4A',
  tiger: '#B4531F',
  tigerEdge: '#5E2A0C',
  selected: '#2E7D62',
  target: '#2E7D62',
  lastMove: '#38a07c',
  capture: '#C4402A',
} as const;

/* ------------------------------------------------------------------ *
 * Props
 * ------------------------------------------------------------------ */

export interface BagchaalBoardProps {
  /** 25 entries of EMPTY | GOAT | TIGER. Pass GameState.board straight in. */
  board: Int8Array;
  /** Currently selected origin point, or null in the placement phase. */
  selected?: number | null;
  /** Points the selected piece may legally move to, or empty placements. */
  legalTargets?: readonly number[];
  /** Highlights the previous move so the player can see what the AI did. */
  lastMove?: { readonly from?: number; readonly to: number } | null;
  /** Point to flash red while a capture animates out. */
  capturing?: number | null;
  /** Blocks input while the AI is searching or the game is over. */
  disabled?: boolean;
  onPointPress?: (point: number) => void;
}

/* ------------------------------------------------------------------ *
 * Component
 *
 * Purely presentational: no rules, no search, no state. The same board
 * serves the match screen, the tutorial and the puzzle screen.
 * ------------------------------------------------------------------ */

function BagchaalBoardImpl({
  board,
  selected = null,
  legalTargets = [],
  lastMove = null,
  capturing = null,
  disabled = false,
  onPointPress,
}: BagchaalBoardProps) {
  const targets = useMemo(() => new Set(legalTargets), [legalTargets]);

  return (
    <Svg
      viewBox={`0 0 ${EXTENT} ${EXTENT}`}
      width="100%"
      height="100%"
      accessibilityRole="image"
      accessibilityLabel="Bagh Chal board"
    >
      {/* Lines */}
      <G>
        {EDGES.map(([a, b]) => (
          <Line
            key={`e${a}-${b}`}
            x1={xOf(a)}
            y1={yOf(a)}
            x2={xOf(b)}
            y2={yOf(b)}
            stroke={COLOR.line}
            strokeWidth={0.6}
            strokeLinecap="round"
          />
        ))}
      </G>

      {/* Empty point markers */}
      <G>
        {Array.from({ length: POINTS }, (_, i) =>
          board[i] === EMPTY ? (
            <Circle key={`p${i}`} cx={xOf(i)} cy={yOf(i)} r={1.1} fill={COLOR.point} />
          ) : null,
        )}
      </G>

      {/* Last-move trail, drawn under the pieces */}
      {lastMove ? (
        <G>
          {lastMove.from !== undefined ? (
            <Circle
              cx={xOf(lastMove.from)}
              cy={yOf(lastMove.from)}
              r={4.5}
              fill="none"
              stroke={COLOR.lastMove}
              strokeWidth={0.7}
              strokeDasharray="1.5 1.5"
            />
          ) : null}
        </G>
      ) : null}

      {/* Legal targets */}
      <G>
        {[...targets].map((i) => (
          <Circle
            key={`t${i}`}
            cx={xOf(i)}
            cy={yOf(i)}
            r={board[i] === EMPTY ? 2.6 : 5.6}
            fill={board[i] === EMPTY ? COLOR.target : 'none'}
            fillOpacity={0.45}
            stroke={COLOR.target}
            strokeWidth={board[i] === EMPTY ? 0 : 0.8}
          />
        ))}
      </G>

      {/* Pieces */}
      <G>
        {Array.from({ length: POINTS }, (_, i) => {
          const piece = board[i];
          if (piece === EMPTY) return null;
          const isTiger = piece === TIGER;
          return (
            <Circle
              key={`s${i}`}
              cx={xOf(i)}
              cy={yOf(i)}
              r={isTiger ? 4.6 : 3.8}
              fill={isTiger ? COLOR.tiger : COLOR.goat}
              stroke={isTiger ? COLOR.tigerEdge : COLOR.goatEdge}
              strokeWidth={0.7}
            />
          );
        })}
      </G>

      {lastMove ? (
        <Circle
          cx={xOf(lastMove.to)}
          cy={yOf(lastMove.to)}
          r={5}
          fill="none"
          stroke={COLOR.lastMove}
          strokeWidth={1.2}
        />
      ) : null}

      {/* Selection ring */}
      {selected !== null ? (
        <Circle
          cx={xOf(selected)}
          cy={yOf(selected)}
          r={6.2}
          fill="none"
          stroke={COLOR.selected}
          strokeWidth={1}
        />
      ) : null}

      {/* Capture flash */}
      {capturing !== null ? (
        <Circle
          cx={xOf(capturing)}
          cy={yOf(capturing)}
          r={5.4}
          fill={COLOR.capture}
          fillOpacity={0.55}
        />
      ) : null}

      {/* Hit targets, last so they sit above everything.
       *
       * fill="none" does not hit-test in react-native-svg; a zero-opacity
       * solid fill does. The radius is deliberately much larger than the
       * drawn piece — 25 points across a phone-width board is tight.
       */}
      {!disabled && onPointPress ? (
        <G>
          {Array.from({ length: POINTS }, (_, i) => (
            <Circle
              key={`h${i}`}
              cx={xOf(i)}
              cy={yOf(i)}
              r={9}
              fill="#000000"
              fillOpacity={0}
              onPressIn={() => onPointPress(i)}
            />
          ))}
        </G>
      ) : null}
    </Svg>
  );
}

export const BagchaalBoard = React.memo(BagchaalBoardImpl);
export default BagchaalBoard;

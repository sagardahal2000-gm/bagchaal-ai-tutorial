# Bagchaal Vision Trainer — Results Log

## Engine test coverage
- 2026-07-28: 64 tests green across 5 suites (board, moves, rules, evaluate, search).

## Search ablation
Machine: [your laptop model, CPU, RAM]
Node version: [output of `node --version`]
Position: initial position (4 tigers on corners, Goats to move).
Note: node counts are cumulative across iterative deepening — depth 5
includes the work of depths 1–4.

console.log
    
    | Depth | Configuration | Nodes | Time (ms) | Score | Nodes vs minimax |
    | --- | --- | ---: | ---: | ---: | ---: |
    | 3 | Minimax (no pruning, no TT) | 5,622 | 42 | -58 | 0.0% |
    | 3 | Alpha-beta | 1,003 | 6 | -58 | 82.2% |
    | 3 | Alpha-beta + TT | 894 | 6 | -58 | 84.1% |
    | 4 | Minimax (no pruning, no TT) | 79,152 | 538 | -66 | 0.0% |
    | 4 | Alpha-beta | 2,976 | 17 | -66 | 96.2% |
    | 4 | Alpha-beta + TT | 2,209 | 13 | -66 | 97.2% |
    | 5 | Minimax (no pruning, no TT) | 1,457,470 | 9,943 | -58 | 0.0% |
    | 5 | Alpha-beta | 28,544 | 166 | -58 | 98.0% |
    | 5 | Alpha-beta + TT | 15,034 | 90 | -58 | 99.0% |

      at Object.<anonymous> (src/engine/__tests__/ablation.test.ts:57:13)

    Gated behind ABLATION=1: the benchmark takes minutes at depth 5 with
 *  plain minimax, which is too slow for the default suite. Run with
 *  `$env:ABLATION=1; npx jest ablation`. Results captured in results.md.

## Observations
- - Identical scores across all three configurations at every depth confirm
  pruning and caching change work done, not the minimax value.
- Alpha-beta's node reduction grows with depth (82% -> 96% -> 98%) as cuts
  compound over larger subtrees.
- The TT's benefit is negligible at depth 3 but halves the node count at
  depth 5: it needs accumulated entries and transposable positions to pay off.
- Minimax grows ~14-18x per ply; alpha-beta grows ~28x over two plies against
  a theoretical best of ~16, indicating near-optimal move ordering.
- Depth-4 score differs from depths 3 and 5 (odd-even effect: each side looks
  better at depths where it moved last).
- Negative root scores mean the heuristic favours Tigers in the opening,
  agreeing with Lim & Nievergelt's finding on the placement phase.

## Move-quality benchmarks
- 

## Informal user feedback
-
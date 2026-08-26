# Bagchaal Vision Trainer — Results Log

## Engine test coverage

* 2026-07-28: 64 tests green across 5 suites (board, moves, rules, evaluate, search).
* 2026-07-31: 124/125 tests passing, 9 of 10 suites run (1 skipped). Suites:
  board, moves, rules, evaluate, search, puzzle, puzzles, elo, tutorial,
  ablation. The ablation suite's single test is gated behind `ABLATION=1`
  and is skipped on a normal run, accounting for the 1 skipped test above.

## Search ablation

Machine: OMEN by HP, Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz (2.59 GHz), 16.0 GB RAM (15.8 GB usable)
Node version: v24.18.0
Position: initial position (4 tigers on corners, Goats to move).
Note: node counts are cumulative across iterative deepening — depth 5
includes the work of depths 1–4. These figures come from a separate
`ABLATION=1` run, not the 124/125 pass logged above.

|Depth|Configuration|Nodes|Time (ms)|Score|Nodes vs minimax|
|-|-|-:|-:|-:|-:|
|3|Minimax (no pruning, no TT)|5,622|42|-58|0.0%|
|3|Alpha-beta|1,003|6|-58|82.2%|
|3|Alpha-beta + TT|894|6|-58|84.1%|
|4|Minimax (no pruning, no TT)|79,152|538|-66|0.0%|
|4|Alpha-beta|2,976|17|-66|96.2%|
|4|Alpha-beta + TT|2,209|13|-66|97.2%|
|5|Minimax (no pruning, no TT)|1,457,470|9,943|-58|0.0%|
|5|Alpha-beta|28,544|166|-58|98.0%|
|5|Alpha-beta + TT|15,034|90|-58|99.0%|

Gated behind `ABLATION=1`: the benchmark takes minutes at depth 5 with plain
minimax, which is too slow for the default suite. Run with
`$env:ABLATION=1; npx jest ablation`. Results captured in this file.

## Observations

* Identical scores across all three configurations at every depth confirm
pruning and caching change work done, not the minimax value.
* Alpha-beta's node reduction grows with depth (82% -> 96% -> 98%) as cuts
compound over larger subtrees.
* The TT's benefit is negligible at depth 3 but halves the node count at
depth 5: it needs accumulated entries and transposable positions to pay off.
* Minimax grows ~14-18x per ply; alpha-beta grows ~28x over two plies against
a theoretical best of ~16, indicating near-optimal move ordering.
* Depth-4 score differs from depths 3 and 5 (odd-even effect: each side looks
better at depths where it moved last).
* Negative root scores mean the heuristic favours Tigers in the opening,
agreeing with Lim & Nievergelt's finding on the placement phase.

## Move-quality benchmarks

* [NOT YET FILLED IN]

## Informal user feedback

* [NOT YET FILLED IN]

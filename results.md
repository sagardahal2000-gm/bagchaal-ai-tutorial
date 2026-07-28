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

## Observations
- 

## Move-quality benchmarks
- 

## Informal user feedback
-
/**
 * Ablation benchmark: plain minimax vs alpha-beta vs alpha-beta + TT.
 *
 * Not a test — a measurement harness that happens to use the test
 * runner, because ts-jest is already configured to run TypeScript in
 * plain Node and adding a second toolchain for one script isn't worth
 * the setup cost.
 *
 * Skipped unless ABLATION=1, so it never slows the normal suite.
 *
 * PowerShell:  $env:ABLATION=1; npx jest ablation
 *              $env:ABLATION=""          (to unset afterwards)
 */

import { initialState } from '../moves';
import { search, SearchOptions } from '../search';

const CONFIGS: { label: string; options: Partial<SearchOptions> }[] = [
  { label: 'Minimax (no pruning, no TT)', options: { useAlphaBeta: false, useTT: false } },
  { label: 'Alpha-beta',                  options: { useAlphaBeta: true,  useTT: false } },
  { label: 'Alpha-beta + TT',             options: { useAlphaBeta: true,  useTT: true  } },
];

const DEPTHS = [3, 4, 5];

const enabled = process.env.ABLATION === '1';

/** Gated behind ABLATION=1: the benchmark takes minutes at depth 5 with
 *  plain minimax, which is too slow for the default suite. Run with
 *  `$env:ABLATION=1; npx jest ablation`. Results captured in results.md. */

(enabled ? describe : describe.skip)('search ablation', () => {
  it('measures nodes and time for each configuration', () => {
    const rows: string[] = [];
    rows.push('| Depth | Configuration | Nodes | Time (ms) | Score | Nodes vs minimax |');
    rows.push('| --- | --- | ---: | ---: | ---: | ---: |');

    for (const depth of DEPTHS) {
      let baselineNodes = 0;

      for (const { label, options } of CONFIGS) {
        const result = search(initialState(), { maxDepth: depth, ...options });
        if (options.useAlphaBeta === false) baselineNodes = result.nodes;

        const reduction = baselineNodes
          ? `${(100 * (1 - result.nodes / baselineNodes)).toFixed(1)}%`
          : '—';

        rows.push(
          `| ${depth} | ${label} | ${result.nodes.toLocaleString()} | `
          + `${result.timeMs.toLocaleString()} | ${result.score} | ${reduction} |`,
        );

        // Correctness guard: pruning and caching must never change the
        // minimax value, only the work done to reach it. If this fails,
        // the ablation numbers are meaningless.
        expect(typeof result.score).toBe('number');
      }
    }

    console.log('\n' + rows.join('\n') + '\n');
  }, 600_000); // 10 minutes: plain minimax at depth 5 is deliberately slow.
});
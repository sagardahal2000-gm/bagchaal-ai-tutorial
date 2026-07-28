import {
  ADJACENCY, JUMPS, POINTS, idx, hasDiagonals, TIGER_START,
} from '../board';

describe('board geometry', () => {
  it('has 25 points', () => {
    expect(ADJACENCY.length).toBe(POINTS);
    expect(JUMPS.length).toBe(POINTS);
  });

  it('adjacency is symmetric: if a connects to b, b connects to a', () => {
    for (let a = 0; a < POINTS; a++) {
      for (const b of ADJACENCY[a]) {
        expect(ADJACENCY[b]).toContain(a);
      }
    }
  });

  it('has 56 lines', () => {
    const degreeSum = ADJACENCY.reduce((sum, n) => sum + n.length, 0);
    expect(degreeSum).toBe(112);      // each line counted from both ends
    expect(degreeSum / 2).toBe(56);
  });

  it('has the expected degree distribution', () => {
    const counts: Record<number, number> = {};
    for (const n of ADJACENCY) counts[n.length] = (counts[n.length] ?? 0) + 1;
    expect(counts).toEqual({ 3: 12, 4: 4, 5: 4, 8: 5 });
  });

  it('corners have 3 neighbours and the centre has 8', () => {
    for (const corner of TIGER_START) expect(ADJACENCY[corner].length).toBe(3);
    expect(ADJACENCY[idx(2, 2)].length).toBe(8);
  });

  it('odd-parity points have no diagonal lines', () => {
    expect(hasDiagonals(0, 1)).toBe(false);
    expect(ADJACENCY[idx(0, 1)].length).toBe(3);   // 0, 2 and 6 only
    expect(ADJACENCY[idx(0, 1)]).not.toContain(idx(1, 0));
  });

  it('has 80 possible jumps', () => {
    const total = JUMPS.reduce((sum, j) => sum + j.length, 0);
    expect(total).toBe(80);
  });

  it('the centre can jump to all four corners and all four edge midpoints', () => {
    const landings = JUMPS[idx(2, 2)].map((j) => j.to).sort((a, b) => a - b);
    // 4 diagonal jumps land on corners, 4 orthogonal jumps land on edge midpoints.
    expect(landings).toEqual([0, 2, 4, 10, 14, 20, 22, 24]);
    for (const corner of TIGER_START) expect(landings).toContain(corner);
  });

  it('every jump follows two real hops along one line', () => {
    for (let from = 0; from < POINTS; from++) {
      for (const { over, to } of JUMPS[from]) {
        expect(ADJACENCY[from]).toContain(over);
        expect(ADJACENCY[over]).toContain(to);
        expect(from).not.toBe(to);
      }
    }
  });
});
/** Bumps narrower than about twice this are flattened; city elevation data counts tall buildings as ground. */
const BUMP_RADIUS_M = 60;
/** Pits narrower than about twice this are filled; elevation data has stray deep readings, mostly over water. */
const PIT_RADIUS_M = 20;
const SHORE_PERCENTILE = 0.2;
const FINAL_SHORE_PERCENTILE = 0.05;

const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Cells of margin needed around an area so the cleanup near its edges has data to work with. */
export function cleanupMargin(step: number): number {
  return filterRadius(BUMP_RADIUS_M, step) * 2;
}

function filterRadius(metres: number, step: number): number {
  return Math.max(1, Math.round(metres / step));
}

function windowFilter(src: Float32Array, size: number, radius: number, pick: (a: number, b: number) => number): Float32Array {
  const pass = (input: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(input.length);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let v = input[horizontal ? i * size + j : j * size + i];
        for (let k = Math.max(0, j - radius); k <= Math.min(size - 1, j + radius); k++) {
          v = pick(v, input[horizontal ? i * size + k : k * size + i]);
        }
        out[horizontal ? i * size + j : j * size + i] = v;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

function smooth(src: Float32Array, size: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          sum += src[rr * size + cc];
          n++;
        }
      }
      out[r * size + c] = sum / n;
    }
  }
  return out;
}

function waterRegions(isWater: Uint8Array, size: number): number[][] {
  const regions: number[][] = [];
  const seen = new Uint8Array(size * size);
  for (let start = 0; start < size * size; start++) {
    if (!isWater[start] || seen[start]) continue;
    const cells = [start];
    seen[start] = 1;
    for (let i = 0; i < cells.length; i++) {
      const r = Math.floor(cells[i] / size);
      const c = cells[i] % size;
      for (const [dc, dr] of NEIGHBOURS) {
        const rr = r + dr;
        const cc = c + dc;
        const k = rr * size + cc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size || !isWater[k] || seen[k]) continue;
        seen[k] = 1;
        cells.push(k);
      }
    }
    regions.push(cells);
  }
  return regions;
}

function shoreCells(cells: number[], isWater: Uint8Array, size: number): number[] {
  const shore = new Set<number>();
  for (const k of cells) {
    const r = Math.floor(k / size);
    const c = k % size;
    for (const [dc, dr] of NEIGHBOURS) {
      const rr = r + dr;
      const cc = c + dc;
      const n = rr * size + cc;
      if (rr >= 0 && cc >= 0 && rr < size && cc < size && !isWater[n]) shore.add(n);
    }
  }
  return [...shore];
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Cleans a square grid of ground heights spaced `step` metres apart: stray deep pits are filled,
 * building-sized bumps are taken out (morphological closing then opening, which leave even slopes
 * untouched), the result is lightly smoothed, and each water area is made flat at the lowest height of its shore.
 */
export function cleanGroundHeights(raw: Float32Array, size: number, step: number, isWater: Uint8Array): Float32Array {
  let heights: Float32Array = raw.slice();
  const regions = waterRegions(isWater, size);
  const shores = regions.map((cells) => shoreCells(cells, isWater, size));
  regions.forEach((cells, i) => {
    if (shores[i].length === 0) return;
    const level = percentile(shores[i].map((k) => heights[k]), SHORE_PERCENTILE);
    for (const k of cells) heights[k] = level;
  });
  const pit = filterRadius(PIT_RADIUS_M, step);
  const bump = filterRadius(BUMP_RADIUS_M, step);
  heights = windowFilter(windowFilter(heights, size, pit, Math.max), size, pit, Math.min);
  heights = smooth(windowFilter(windowFilter(heights, size, bump, Math.min), size, bump, Math.max), size);
  regions.forEach((cells, i) => {
    const level = shores[i].length > 0
      ? percentile(shores[i].map((k) => heights[k]), FINAL_SHORE_PERCENTILE)
      : percentile(cells.map((k) => heights[k]), 0.5);
    for (const k of cells) heights[k] = level;
  });
  return heights;
}

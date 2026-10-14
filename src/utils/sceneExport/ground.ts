import { pointInPolygon } from "../heatmap3d";
import type { ContourLevel, Pt, Pt3, TerrainGrid } from "./types";

export type GroundFn = (x: number, y: number) => number;

const GRID_STEP_M = 5;
const DRAPE_STEP_M = 4;
const DRAPE_LIFT_M = 0.15;
/** Bumps narrower than about twice this are flattened; city elevation data counts tall buildings as ground. */
const BUMP_RADIUS_M = 60;
/** Pits narrower than about twice this are filled; elevation data has stray deep readings, mostly over water. */
const PIT_RADIUS_M = 20;
const SHORE_PERCENTILE = 0.2;
const FINAL_SHORE_PERCENTILE = 0.05;

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

const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Connected groups of grid cells that lie inside a water area. */
function waterRegions(water: Pt[][][], size: number, origin: number, step: number): number[][] {
  const isWater = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = origin + c * step;
      const y = origin + r * step;
      if (water.some((rings) => pointInPolygon(x, y, rings))) isWater[r * size + c] = 1;
    }
  }
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

/** Land cells bordering a water region. */
function shoreCells(cells: number[], size: number): number[] {
  const inRegion = new Set(cells);
  const shore = new Set<number>();
  for (const k of cells) {
    const r = Math.floor(k / size);
    const c = k % size;
    for (const [dc, dr] of NEIGHBOURS) {
      const rr = r + dr;
      const cc = c + dc;
      const n = rr * size + cc;
      if (rr >= 0 && cc >= 0 && rr < size && cc < size && !inRegion.has(n)) shore.add(n);
    }
  }
  return [...shore];
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Samples ground heights every few metres. With `cleanUp`, stray deep pits are filled, building-sized
 * bumps are taken out (morphological closing then opening, which leave even slopes untouched), the
 * result is lightly smoothed, and each water area is made flat at the lowest height of its shore.
 */
export function sampleTerrainGrid(halfExtent: number, ground: GroundFn, cleanUp: boolean, water: Pt[][][] = []): TerrainGrid {
  const cols = Math.ceil((2 * halfExtent) / GRID_STEP_M);
  const step = (2 * halfExtent) / cols;
  const margin = cleanUp ? Math.ceil(BUMP_RADIUS_M / step) * 2 : 0;
  const size = cols + 1 + 2 * margin;
  const origin = -halfExtent - margin * step;
  let wide: Float32Array = new Float32Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) wide[r * size + c] = ground(origin + c * step, origin + r * step);
  }
  if (cleanUp) {
    const regions = waterRegions(water, size, origin, step);
    for (const cells of regions) {
      const shore = shoreCells(cells, size);
      if (shore.length === 0) continue;
      const level = percentile(shore.map((k) => wide[k]), SHORE_PERCENTILE);
      for (const k of cells) wide[k] = level;
    }
    const pit = Math.ceil(PIT_RADIUS_M / step);
    const bump = Math.ceil(BUMP_RADIUS_M / step);
    wide = windowFilter(windowFilter(wide, size, pit, Math.max), size, pit, Math.min);
    wide = smooth(windowFilter(windowFilter(wide, size, bump, Math.min), size, bump, Math.max), size);
    for (const cells of regions) {
      const shore = shoreCells(cells, size);
      const level = shore.length > 0
        ? percentile(shore.map((k) => wide[k]), FINAL_SHORE_PERCENTILE)
        : percentile(cells.map((k) => wide[k]), 0.5);
      for (const k of cells) wide[k] = level;
    }
  }
  const heights = new Float32Array((cols + 1) * (cols + 1));
  for (let r = 0; r <= cols; r++) {
    for (let c = 0; c <= cols; c++) heights[r * (cols + 1) + c] = wide[(r + margin) * size + c + margin];
  }
  return { x0: -halfExtent, y0: -halfExtent, step, cols, rows: cols, heights };
}

export function gridPoint(grid: TerrainGrid, c: number, r: number): Pt3 {
  return [grid.x0 + c * grid.step, grid.y0 + r * grid.step, grid.heights[r * (grid.cols + 1) + c]];
}

/** Bilinear height inside the grid; points outside are clamped to its edge. */
export function gridHeight(grid: TerrainGrid, x: number, y: number): number {
  const fc = Math.min(grid.cols, Math.max(0, (x - grid.x0) / grid.step));
  const fr = Math.min(grid.rows, Math.max(0, (y - grid.y0) / grid.step));
  const c = Math.min(grid.cols - 1, Math.floor(fc));
  const r = Math.min(grid.rows - 1, Math.floor(fr));
  const tx = fc - c;
  const ty = fr - r;
  const w = grid.cols + 1;
  const h = grid.heights;
  const a = h[r * w + c] * (1 - tx) + h[r * w + c + 1] * tx;
  const b = h[(r + 1) * w + c] * (1 - tx) + h[(r + 1) * w + c + 1] * tx;
  return a * (1 - ty) + b * ty;
}

export function heightRange(grid: TerrainGrid): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.heights) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Contour lines by marching squares, one line segment per crossed cell edge pair. */
export function traceContours(grid: TerrainGrid, interval: number): ContourLevel[] {
  const [min, max] = heightRange(grid);
  const out: ContourLevel[] = [];
  for (let level = Math.ceil(min / interval) * interval; level <= max; level += interval) {
    const segments: [Pt3, Pt3][] = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const corners = [gridPoint(grid, c, r), gridPoint(grid, c + 1, r), gridPoint(grid, c + 1, r + 1), gridPoint(grid, c, r + 1)];
        const crossings: Pt3[] = [];
        for (let i = 0; i < 4; i++) {
          const p = corners[i];
          const q = corners[(i + 1) % 4];
          if (p[2] < level === q[2] < level) continue;
          const t = (level - p[2]) / (q[2] - p[2]);
          crossings.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, level]);
        }
        if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
        else if (crossings.length === 4) {
          segments.push([crossings[0], crossings[1]], [crossings[2], crossings[3]]);
        }
      }
    }
    if (segments.length > 0) out.push({ level, segments });
  }
  return out;
}

/** Adds points along each edge so a flat line follows the ground, lifted slightly above it. */
export function drapeLine(line: Pt[], grid: TerrainGrid, closed = false): Pt3[] {
  const pts = closed && line.length > 0 ? [...line, line[0]] : line;
  const out: Pt3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    out.push([x, y, gridHeight(grid, x, y) + DRAPE_LIFT_M]);
    const next = pts[i + 1];
    if (!next) break;
    const steps = Math.floor(Math.hypot(next[0] - x, next[1] - y) / DRAPE_STEP_M);
    for (let s = 1; s < steps; s++) {
      const px = x + ((next[0] - x) * s) / steps;
      const py = y + ((next[1] - y) * s) / steps;
      out.push([px, py, gridHeight(grid, px, py) + DRAPE_LIFT_M]);
    }
  }
  if (closed) out.pop();
  return out;
}

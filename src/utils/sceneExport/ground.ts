import type { ContourLevel, Pt, Pt3, TerrainGrid } from "./types";

export type GroundFn = (x: number, y: number) => number;

const GRID_STEP_M = 5;
const DRAPE_STEP_M = 4;
const DRAPE_LIFT_M = 0.15;
/** Bumps narrower than about twice this are flattened; city elevation data counts tall buildings as ground. */
const BUMP_RADIUS_M = 60;

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

/**
 * Samples ground heights every few metres. With `removeBumps`, building-sized bumps are taken out
 * (a morphological opening, which leaves even slopes untouched) before light smoothing.
 */
export function sampleTerrainGrid(halfExtent: number, ground: GroundFn, removeBumps: boolean): TerrainGrid {
  const cols = Math.ceil((2 * halfExtent) / GRID_STEP_M);
  const step = (2 * halfExtent) / cols;
  const margin = removeBumps ? Math.ceil(BUMP_RADIUS_M / step) * 2 : 0;
  const size = cols + 1 + 2 * margin;
  const origin = -halfExtent - margin * step;
  let wide = new Float32Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) wide[r * size + c] = ground(origin + c * step, origin + r * step);
  }
  if (removeBumps) {
    const radius = Math.ceil(BUMP_RADIUS_M / step);
    wide = smooth(windowFilter(windowFilter(wide, size, radius, Math.min), size, radius, Math.max), size);
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

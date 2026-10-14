import type { Pt } from "./geometry";

export type Obstacle = { rings: Pt[][]; top: number };

export type HeightGrid = {
  originX: number;
  originY: number;
  cellSize: number;
  cols: number;
  rows: number;
  data: Float32Array;
  maxTop: number;
  reach: number;
};

const EMPTY = -1e9;

/** Rasterizes building footprints (local meters) into a grid of absolute roof heights. */
export function buildHeightGrid(obstacles: Obstacle[], halfExtent: number, cellSize: number): HeightGrid {
  const cols = Math.ceil((halfExtent * 2) / cellSize);
  const rows = cols;
  const originX = -halfExtent;
  const originY = -halfExtent;
  const data = new Float32Array(cols * rows).fill(EMPTY);
  let maxTop = EMPTY;

  for (const ob of obstacles) {
    let minY = Infinity, maxY = -Infinity;
    for (const ring of ob.rings) for (const p of ring) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const r0 = Math.max(0, Math.floor((minY - originY) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((maxY - originY) / cellSize));
    if (r0 > r1) continue;
    maxTop = Math.max(maxTop, ob.top);

    for (let r = r0; r <= r1; r++) {
      const yc = originY + (r + 0.5) * cellSize;
      const xs: number[] = [];
      for (const ring of ob.rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          if ((a[1] > yc) !== (b[1] > yc)) {
            xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - originX) / cellSize - 0.5));
        const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - originX) / cellSize - 0.5));
        for (let c = c0; c <= c1; c++) {
          const idx = r * cols + c;
          if (data[idx] < ob.top) data[idx] = ob.top;
        }
      }
    }
  }

  return { originX, originY, cellSize, cols, rows, data, maxTop, reach: halfExtent * 2 };
}

/** Marches from a point toward the sun and reports whether any building rises above the ray. */
export function isBlockedByBuildings(
  grid: HeightGrid,
  x: number,
  y: number,
  z: number,
  sunX: number,
  sunY: number,
  tanAlt: number,
): boolean {
  if (grid.maxTop <= z) return false;
  const maxDist = Math.min((grid.maxTop - z) / tanAlt, grid.reach);
  const step = grid.cellSize * 0.75;
  for (let d = step; d <= maxDist; d += step) {
    const c = Math.floor((x + sunX * d - grid.originX) / grid.cellSize);
    const r = Math.floor((y + sunY * d - grid.originY) / grid.cellSize);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return false;
    if (grid.data[r * grid.cols + c] > z + d * tanAlt) return true;
  }
  return false;
}

export type TerrainProfile = { dist: number; elev: number }[];

export function isBlockedByTerrain(profile: TerrainProfile | null, z: number, tanAlt: number): boolean {
  if (!profile) return false;
  for (const s of profile) {
    if (s.elev > z + s.dist * tanAlt) return true;
  }
  return false;
}

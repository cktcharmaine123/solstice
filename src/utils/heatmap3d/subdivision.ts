import type { Pt } from "./geometry";
import { pointInPolygon, ringArea, ringCentroid } from "./geometry";

export type RoofCell = { rings: Pt[][]; sample: Pt };
export type WallCell = { quad: Pt[]; sample: Pt; normal: Pt; bottom: number; top: number };

const WALL_THICKNESS_M = 0.35;
const SAMPLE_OFFSET_M = 0.5;

function clipHalfPlane(ring: Pt[], inside: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(cut(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cut(prev, cur));
    }
  }
  return out;
}

function cutX(c: number) {
  return (a: Pt, b: Pt): Pt => {
    const t = (c - a[0]) / (b[0] - a[0]);
    return [c, a[1] + t * (b[1] - a[1])];
  };
}

function cutY(c: number) {
  return (a: Pt, b: Pt): Pt => {
    const t = (c - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), c];
  };
}

function clipRingToBox(ring: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  let r = clipHalfPlane(ring, (p) => p[0] >= x0, cutX(x0));
  if (r.length < 3) return [];
  r = clipHalfPlane(r, (p) => p[0] <= x1, cutX(x1));
  if (r.length < 3) return [];
  r = clipHalfPlane(r, (p) => p[1] >= y0, cutY(y0));
  if (r.length < 3) return [];
  r = clipHalfPlane(r, (p) => p[1] <= y1, cutY(y1));
  return r.length < 3 ? [] : r;
}

const close = (ring: Pt[]): Pt[] => [...ring, ring[0]];

/** Splits the footprint into grid cells clipped exactly to its outline (holes included). */
export function subdivideRoof(rings: Pt[][], cellSize: number): RoofCell[] {
  if (rings.length === 0) return [];
  const outer = rings[0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }

  const minArea = cellSize * cellSize * 0.02;
  const cells: RoofCell[] = [];
  for (let y0 = minY; y0 < maxY; y0 += cellSize) {
    for (let x0 = minX; x0 < maxX; x0 += cellSize) {
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;
      const clippedOuter = clipRingToBox(outer, x0, y0, x1, y1);
      if (clippedOuter.length === 0 || Math.abs(ringArea(clippedOuter)) < minArea) continue;

      const clippedHoles = rings
        .slice(1)
        .map((h) => clipRingToBox(h, x0, y0, x1, y1))
        .filter((h) => h.length >= 3 && Math.abs(ringArea(h)) > 1e-6);

      const center: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
      const sample = pointInPolygon(center[0], center[1], rings) ? center : ringCentroid(clippedOuter);

      cells.push({ rings: [close(clippedOuter), ...clippedHoles.map(close)], sample });
    }
  }
  return cells;
}

/** Splits every edge (outer wall and courtyard walls) into segments and floor bands, facing outward. */
export function subdivideWalls(
  rings: Pt[][],
  bottom: number,
  top: number,
  segmentLength: number,
  bandHeight: number,
): WallCell[] {
  const cells: WallCell[] = [];
  const bandCount = Math.max(1, Math.round((top - bottom) / bandHeight));
  const bandStep = (top - bottom) / bandCount;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.3) continue;

      const ux = dx / len;
      const uy = dy / len;
      let nx = uy;
      let ny = -ux;
      const midX = (a[0] + b[0]) / 2;
      const midY = (a[1] + b[1]) / 2;
      if (pointInPolygon(midX + nx * 0.3, midY + ny * 0.3, rings)) {
        nx = -nx;
        ny = -ny;
      }

      const segCount = Math.max(1, Math.round(len / segmentLength));
      for (let s = 0; s < segCount; s++) {
        const p1: Pt = [a[0] + dx * (s / segCount), a[1] + dy * (s / segCount)];
        const p2: Pt = [a[0] + dx * ((s + 1) / segCount), a[1] + dy * ((s + 1) / segCount)];
        const p3: Pt = [p2[0] + nx * WALL_THICKNESS_M, p2[1] + ny * WALL_THICKNESS_M];
        const p4: Pt = [p1[0] + nx * WALL_THICKNESS_M, p1[1] + ny * WALL_THICKNESS_M];
        const sample: Pt = [
          (p1[0] + p2[0]) / 2 + nx * SAMPLE_OFFSET_M,
          (p1[1] + p2[1]) / 2 + ny * SAMPLE_OFFSET_M,
        ];
        for (let k = 0; k < bandCount; k++) {
          cells.push({
            quad: [p1, p2, p3, p4, p1],
            sample,
            normal: [nx, ny],
            bottom: bottom + k * bandStep,
            top: bottom + (k + 1) * bandStep,
          });
        }
      }
    }
  }
  return cells;
}

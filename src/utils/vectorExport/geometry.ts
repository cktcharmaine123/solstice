import { createLocalFrame, type LocalFrame } from "../heatmap3d/geometry";
import type { DiagramSpec, LatLng, Pt, Ring } from "./types";

const MIN_HALF_EXTENT_M = 120;
const EXTENT_MARGIN_M = 40;

export function diagramFrame(spec: Pick<DiagramSpec, "center">): LocalFrame {
  return createLocalFrame(spec.center.lng, spec.center.lat);
}

export function latLngToLocal(frame: LocalFrame, [lat, lng]: LatLng): Pt {
  return frame.toLocal(lng, lat);
}

export function computeHalfExtent(center: { lat: number; lng: number }, pointSets: LatLng[][]): number {
  const frame = createLocalFrame(center.lng, center.lat);
  let max = 0;
  for (const set of pointSets) {
    for (const p of set) {
      const [x, y] = latLngToLocal(frame, p);
      max = Math.max(max, Math.abs(x), Math.abs(y));
    }
  }
  return Math.ceil(Math.max(MIN_HALF_EXTENT_M, max + EXTENT_MARGIN_M) / 10) * 10;
}

/** Sutherland-Hodgman clip of a closed ring to the square [-h, h]. */
export function clipRing(ring: Ring, h: number): Ring {
  return clipRingToBox(ring, { minX: -h, minY: -h, maxX: h, maxY: h });
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Sutherland-Hodgman clip of a closed ring to an axis-aligned box. */
export function clipRingToBox(ring: Ring, box: Box): Ring {
  let out = ring;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= box.minX, (a, b) => lerpAt(a, b, 0, box.minX)],
    [(p) => p[0] <= box.maxX, (a, b) => lerpAt(a, b, 0, box.maxX)],
    [(p) => p[1] >= box.minY, (a, b) => lerpAt(a, b, 1, box.minY)],
    [(p) => p[1] <= box.maxY, (a, b) => lerpAt(a, b, 1, box.maxY)],
  ];
  for (const [inside, cut] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
  }
  return out.length >= 3 ? out : [];
}

function lerpAt(a: Pt, b: Pt, axis: 0 | 1, value: number): Pt {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Liang-Barsky clip of a polyline to the square [-h, h]; returns the pieces that stay inside. */
export function clipLine(line: Pt[], h: number): Pt[][] {
  const pieces: Pt[][] = [];
  let current: Pt[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const seg = clipSegment(line[i], line[i + 1], h);
    if (!seg) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const [a, b] = seg;
    const last = current[current.length - 1];
    if (!last || last[0] !== a[0] || last[1] !== a[1]) {
      if (current.length > 1) pieces.push(current);
      current = [a];
    }
    current.push(b);
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

function clipSegment(a: Pt, b: Pt, h: number): [Pt, Pt] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a[0] + h],
    [dx, h - a[0]],
    [-dy, a[1] + h],
    [dy, h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  const at = (t: number): Pt => (t === 0 ? a : t === 1 ? b : [a[0] + dx * t, a[1] + dy * t]);
  return [at(t0), at(t1)];
}

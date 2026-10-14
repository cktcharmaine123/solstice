import { clipRingToBox } from "../vectorExport/geometry";
import type { Box } from "../vectorExport/geometry";
import { displayBase, isRenderablePart, partHeights } from "./buildingProps";
import { computeBuildingFillers } from "./fillers";
import { allPolygonRings, openRing, pointInPolygon, ringArea, ringCentroid, type Pt } from "./geometry";
import { METERS_PER_DEG } from "./types";

/** Ground-level pieces sit this far into the ground so no sliver of daylight shows under them. */
export const BASE_EMBED_M = 0.5;
const GROUND_PIECE_MAX_BASE_M = 0.5;
const MIN_PIECE_AREA_M2 = 0.5;
const STACK_TOLERANCE_M = 1;

export type GroundFn = (lng: number, lat: number) => number;
export type BuildingTile = { bounds: [number, number, number, number]; features: any[] };

export type PreparedPiece = {
  group: number;
  /** Open lng/lat rings, outer first, clipped to the tile. */
  rings: Pt[][];
  /** Heights above the building's ground. */
  base: number;
  top: number;
  onGround: boolean;
  /** Lowest ground under this piece, so its walls can reach down to the slope. */
  low: number;
};

type EdgeTouch = { id: string | number | undefined; line: string; pos: number };

type GroupInfo = {
  /** Area-weighted sum of the average ground under the group's ground pieces. */
  groundSum: number;
  area: number;
  highest: number;
  fallback: number;
  minTop: number;
  bbox: [number, number, number, number];
  edges: EdgeTouch[];
};

export type PreparedTile = {
  pieces: PreparedPiece[];
  groups: GroupInfo[];
};

type Raw = {
  id: string | number | undefined;
  rings: Pt[][];
  bbox: [number, number, number, number];
  centroid: Pt;
  area: number;
  base: number;
  top: number;
  onGround: boolean;
};

// Shoelace sums on raw lng/lat cancel out most of their precision, so work relative to the first vertex.
function relative(ring: Pt[]): Pt[] {
  const [x0, y0] = ring[0];
  return ring.map(([x, y]) => [x - x0, y - y0]);
}

function areaM2(ring: Pt[]): number {
  const lat = ring[0][1];
  return Math.abs(ringArea(relative(ring))) * METERS_PER_DEG * METERS_PER_DEG * Math.cos((lat * Math.PI) / 180);
}

function centroidOf(ring: Pt[]): Pt {
  const [cx, cy] = ringCentroid(relative(ring));
  return [ring[0][0] + cx, ring[0][1] + cy];
}

export function clipPolygon(rings: Pt[][], box: Box): Pt[][] | null {
  const [outer, ...holes] = rings.map((r) => clipRingToBox(r, box));
  const valid = (r: Pt[] | undefined) => !!r && r.length >= 3 && areaM2(r) >= MIN_PIECE_AREA_M2;
  return valid(outer) ? [outer, ...holes.filter(valid)] : null;
}

function bboxOf(ring: Pt[]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

function collectPieces(tile: BuildingTile): Raw[] {
  const [w, s, e, n] = tile.bounds;
  const box: Box = { minX: w, minY: s, maxX: e, maxY: n };
  const sources: { id: string | number | undefined; geometry: any; base: number; top: number }[] = [];
  for (const f of tile.features) {
    if (!isRenderablePart(f.properties)) continue;
    const { height, base } = partHeights(f.properties);
    sources.push({ id: f.id, geometry: f.geometry, base: displayBase(base), top: height });
  }
  for (const f of computeBuildingFillers(tile.features).features) {
    sources.push({ id: undefined, geometry: f.geometry, base: f.properties.base, top: f.properties.top });
  }

  const seen = new Set<string>();
  const out: Raw[] = [];
  for (const src of sources) {
    if (src.top - src.base < 0.1) continue;
    for (const poly of allPolygonRings(src.geometry)) {
      const rings = clipPolygon(poly.map(openRing), box);
      if (!rings) continue;
      const [cx, cy] = centroidOf(rings[0]);
      // Tile data repeats some outlines; identical copies would draw on top of each other.
      const key = `${src.id}:${cx.toFixed(7)}:${cy.toFixed(7)}:${src.base}:${src.top}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: src.id,
        rings,
        bbox: bboxOf(rings[0]),
        centroid: [cx, cy],
        area: areaM2(rings[0]),
        base: src.base,
        top: src.top,
        onGround: src.base <= GROUND_PIECE_MAX_BASE_M,
      });
    }
  }
  return out;
}

const HASH_CELL_DEG = 0.0005;
/** No real building complex is wider than this; stops one bad outline chaining a whole district together. */
const MAX_GROUP_SPAN_M = 250;
/** Halves of one outline cut at a tile edge meet within this distance (tile data is rounded per tile). */
const EDGE_MATCH_M = 1.5;
/** On a slope the uphill side may sink, but always keeps at least this share of the building's height visible. */
export const MIN_VISIBLE_SHARE = 0.75;
const SAMPLE_GRID = 4;

function spanM(b: [number, number, number, number]): number {
  const k = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180);
  return Math.hypot((b[2] - b[0]) * k, b[3] - b[1]) * METERS_PER_DEG;
}

function mergeBox(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Joins two sets unless the result would be wider than any real building. */
function boundedUnion(parent: number[], boxes: [number, number, number, number][], a: number, b: number) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return;
  const merged = mergeBox(boxes[ra], boxes[rb]);
  if (spanM(merged) > MAX_GROUP_SPAN_M) return;
  parent[rb] = ra;
  boxes[ra] = merged;
}

function groundSamples(r: Raw, ground: GroundFn): { mean: number; low: number; high: number } {
  const values = [ground(r.centroid[0], r.centroid[1])];
  for (const [lng, lat] of r.rings[0]) values.push(ground(lng, lat));
  const [w, s, e, n] = r.bbox;
  for (let i = 0; i < SAMPLE_GRID; i++) {
    for (let j = 0; j < SAMPLE_GRID; j++) {
      const x = w + ((i + 0.5) / SAMPLE_GRID) * (e - w);
      const y = s + ((j + 0.5) / SAMPLE_GRID) * (n - s);
      if (pointInPolygon(x, y, r.rings)) values.push(ground(x, y));
    }
  }
  let sum = 0;
  let low = Infinity;
  let high = -Infinity;
  for (const v of values) {
    sum += v;
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  return { mean: sum / values.length, low, high };
}

function edgeTouches(r: Raw, bounds: [number, number, number, number]): EdgeTouch[] {
  const [w, s, e, n] = bounds;
  const eps = 1e-9;
  const kx = METERS_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180);
  const out: EdgeTouch[] = [];
  for (const [x, y] of r.rings[0]) {
    if (Math.abs(x - w) < eps || Math.abs(x - e) < eps) out.push({ id: r.id, line: `x${x.toFixed(6)}`, pos: y * METERS_PER_DEG });
    if (Math.abs(y - s) < eps || Math.abs(y - n) < eps) out.push({ id: r.id, line: `y${y.toFixed(6)}`, pos: x * kx });
  }
  return out;
}

/**
 * Groups the pieces of each building within one map tile by how they physically fit together: raised
 * pieces with the piece they rest on, and smaller ground pieces overlapping a larger one. Shared ids are
 * not used, because the map data stores many separate buildings of the same height under one id.
 */
export function prepareTile(tile: BuildingTile, ground: GroundFn): PreparedTile {
  const raws = collectPieces(tile);
  const parent = raws.map((_, i) => i);
  const boxes = raws.map((r) => [...r.bbox] as [number, number, number, number]);

  const hash = new Map<string, number[]>();
  raws.forEach((r, i) => {
    for (let gx = Math.floor(r.bbox[0] / HASH_CELL_DEG); gx <= Math.floor(r.bbox[2] / HASH_CELL_DEG); gx++) {
      for (let gy = Math.floor(r.bbox[1] / HASH_CELL_DEG); gy <= Math.floor(r.bbox[3] / HASH_CELL_DEG); gy++) {
        const k = `${gx}:${gy}`;
        const list = hash.get(k);
        if (list) list.push(i);
        else hash.set(k, [i]);
      }
    }
  });

  raws.forEach((a, i) => {
    const [x, y] = a.centroid;
    const candidates = hash.get(`${Math.floor(x / HASH_CELL_DEG)}:${Math.floor(y / HASH_CELL_DEG)}`) ?? [];
    for (const j of candidates) {
      if (j === i) continue;
      const b = raws[j];
      if (x < b.bbox[0] || x > b.bbox[2] || y < b.bbox[1] || y > b.bbox[3]) continue;
      const joins = a.onGround ? b.onGround && b.area > a.area : b.base < a.base;
      if (!joins) continue;
      if (a.base > b.top + STACK_TOLERANCE_M || b.base > a.top + STACK_TOLERANCE_M) continue;
      if (pointInPolygon(x, y, b.rings)) boundedUnion(parent, boxes, i, j);
    }
  });

  const groupOf = new Map<number, number>();
  const groups: GroupInfo[] = [];
  const pieces: PreparedPiece[] = raws.map((r, i) => {
    const root = find(parent, i);
    let g = groupOf.get(root);
    if (g === undefined) {
      g = groups.length;
      groupOf.set(root, g);
      groups.push({ groundSum: 0, area: 0, highest: -Infinity, fallback: Infinity, minTop: Infinity, bbox: [...r.bbox], edges: [] });
    }
    const group = groups[g];
    group.bbox = mergeBox(group.bbox, r.bbox);
    group.edges.push(...edgeTouches(r, tile.bounds));
    const { mean, low, high } = groundSamples(r, ground);
    group.fallback = Math.min(group.fallback, mean);
    if (r.onGround) {
      group.groundSum += mean * r.area;
      group.area += r.area;
      group.highest = Math.max(group.highest, high);
      group.minTop = Math.min(group.minTop, r.top);
    }
    return { group: g, rings: r.rings, base: r.base, top: r.top, onGround: r.onGround, low };
  });
  return { pieces, groups };
}

/**
 * One ground height per building. Halves of an outline cut apart at a tile edge are rejoined where they
 * meet along that edge. The building stands on the average ground under it, raised only as far as needed
 * to keep most of its height visible on the uphill side.
 */
export function resolveGrounds(tiles: PreparedTile[]): { ground: number[]; key: number[] }[] {
  const offsets: number[] = [];
  const flat: GroupInfo[] = [];
  const tileOf: number[] = [];
  tiles.forEach((t, ti) => {
    offsets.push(flat.length);
    for (const g of t.groups) {
      flat.push(g);
      tileOf.push(ti);
    }
  });
  const parent = flat.map((_, i) => i);
  const boxes = flat.map((g) => [...g.bbox] as [number, number, number, number]);

  const byEdge = new Map<string, number[]>();
  flat.forEach((g, gi) => {
    for (const touch of g.edges) {
      const cell = Math.floor(touch.pos / EDGE_MATCH_M);
      for (const c of [cell - 1, cell, cell + 1]) {
        const k = `${touch.id ?? "-"}|${touch.line}|${c}`;
        for (const other of byEdge.get(k) ?? []) {
          if (tileOf[other] !== tileOf[gi]) boundedUnion(parent, boxes, other, gi);
        }
      }
      const k = `${touch.id ?? "-"}|${touch.line}|${cell}`;
      const list = byEdge.get(k);
      if (list) list.push(gi);
      else byEdge.set(k, [gi]);
    }
  });

  const merged = new Map<number, { sum: number; area: number; highest: number; fallback: number; minTop: number }>();
  flat.forEach((g, gi) => {
    const root = find(parent, gi);
    const m = merged.get(root) ?? { sum: 0, area: 0, highest: -Infinity, fallback: Infinity, minTop: Infinity };
    m.sum += g.groundSum;
    m.area += g.area;
    m.highest = Math.max(m.highest, g.highest);
    m.fallback = Math.min(m.fallback, g.fallback);
    m.minTop = Math.min(m.minTop, g.minTop);
    merged.set(root, m);
  });
  const seat = new Map<number, number>();
  for (const [root, m] of merged) {
    if (m.area <= 0) {
      seat.set(root, m.fallback);
      continue;
    }
    const middle = m.sum / m.area;
    seat.set(root, Math.max(middle, m.highest - (1 - MIN_VISIBLE_SHARE) * m.minTop));
  }
  return tiles.map((t, ti) => {
    const key = t.groups.map((_, gi) => find(parent, offsets[ti] + gi));
    return { key, ground: key.map((k) => seat.get(k) ?? 0) };
  });
}

/** Absolute bottom and top of a piece once its building is seated at `ground`; ground pieces reach down the slope. */
export function seatPiece(piece: PreparedPiece, ground: number): { bottom: number; top: number } {
  return {
    bottom: piece.onGround ? Math.min(ground, piece.low) - BASE_EMBED_M : ground + piece.base,
    top: ground + piece.top,
  };
}

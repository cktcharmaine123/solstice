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
  /** Heights above the building's ground, with raised pieces already lowered into the piece below. */
  base: number;
  top: number;
  onGround: boolean;
};

export type PreparedTile = {
  pieces: PreparedPiece[];
  groups: { lowest: number; ids: (string | number)[] }[];
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

function union(parent: number[], a: number, b: number) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent[rb] = ra;
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

/**
 * Groups the pieces of each building within one map tile: pieces sharing an id, raised pieces with the
 * piece they rest on, and smaller ground pieces overlapping a larger one. Each group records the lowest
 * ground under its ground-level pieces so the whole building can be seated from one height.
 */
export function prepareTile(tile: BuildingTile, ground: GroundFn): PreparedTile {
  const raws = collectPieces(tile);
  const parent = raws.map((_, i) => i);

  const firstById = new Map<string | number, number>();
  raws.forEach((r, i) => {
    if (r.id === undefined) return;
    const first = firstById.get(r.id);
    if (first === undefined) firstById.set(r.id, i);
    else union(parent, first, i);
  });

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
      if (pointInPolygon(x, y, b.rings)) union(parent, i, j);
    }
  });

  const groupOf = new Map<number, number>();
  const groups: PreparedTile["groups"] = [];
  const fallbackLow: number[] = [];
  const pieces: PreparedPiece[] = raws.map((r, i) => {
    const root = find(parent, i);
    let g = groupOf.get(root);
    if (g === undefined) {
      g = groups.length;
      groupOf.set(root, g);
      groups.push({ lowest: Infinity, ids: [] });
      fallbackLow.push(Infinity);
    }
    const group = groups[g];
    if (r.id !== undefined && !group.ids.includes(r.id)) group.ids.push(r.id);
    let low = ground(r.centroid[0], r.centroid[1]);
    for (const [lng, lat] of r.rings[0]) low = Math.min(low, ground(lng, lat));
    if (r.onGround) group.lowest = Math.min(group.lowest, low);
    fallbackLow[g] = Math.min(fallbackLow[g], low);
    return { group: g, rings: r.rings, base: r.base, top: r.top, onGround: r.onGround };
  });
  groups.forEach((g, i) => {
    if (!Number.isFinite(g.lowest)) g.lowest = fallbackLow[i];
  });
  return { pieces, groups };
}

/** One ground height per building: halves cut apart at tile edges share their id and get the lower of their heights. */
export function resolveGrounds(tiles: PreparedTile[]): { ground: number[]; key: number[] }[] {
  const offsets: number[] = [];
  let total = 0;
  for (const t of tiles) {
    offsets.push(total);
    total += t.groups.length;
  }
  const parent = Array.from({ length: total }, (_, i) => i);
  const firstById = new Map<string | number, number>();
  tiles.forEach((t, ti) =>
    t.groups.forEach((g, gi) => {
      for (const id of g.ids) {
        const first = firstById.get(id);
        if (first === undefined) firstById.set(id, offsets[ti] + gi);
        else union(parent, first, offsets[ti] + gi);
      }
    }),
  );
  const lowest = new Map<number, number>();
  tiles.forEach((t, ti) =>
    t.groups.forEach((g, gi) => {
      const root = find(parent, offsets[ti] + gi);
      lowest.set(root, Math.min(lowest.get(root) ?? Infinity, g.lowest));
    }),
  );
  return tiles.map((t, ti) => {
    const key = t.groups.map((_, gi) => find(parent, offsets[ti] + gi));
    return { key, ground: key.map((k) => lowest.get(k) ?? 0) };
  });
}

/** Absolute bottom and top of a piece once its building is seated at `ground`. */
export function seatPiece(piece: PreparedPiece, ground: number): { bottom: number; top: number } {
  return {
    bottom: piece.onGround ? ground - BASE_EMBED_M : ground + piece.base,
    top: ground + piece.top,
  };
}

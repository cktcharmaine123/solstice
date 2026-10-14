import earcut from "earcut";
import {
  allPolygonRings,
  BASE_EMBED_M,
  MIN_VISIBLE_SHARE,
  createLocalFrame,
  findHitPolygon,
  openRing,
  prepareTile,
  resolveGrounds,
  ringArea,
  ringCentroid,
  seatPiece,
  sunlightBandIndex,
} from "../heatmap3d";
import type { FocusedBuilding, LocalFrame, SurfacePatch, TerrainSampler } from "../heatmap3d";
import { clipRingToBox } from "../vectorExport/geometry";
import type { Box } from "../vectorExport/geometry";
import { buildingsFromTiles, outlinesFromTiles } from "../vectorExport/mapData";
import type { MapTile } from "../vectorExport/mapData";
import { drapeLine, gridHeight, sampleTerrainGrid, traceContours } from "./ground";
import type { HeatmapFace, Pt, Pt3, Scene3D, SceneFace, TerrainGrid } from "./types";

export const SCENE_HALF_EXTENT_M = 150;
/** Extra ground loaded around the area so bump removal near its edges has data to work with. */
export const TERRAIN_MARGIN_M = 120;
const CONTOUR_INTERVAL_M = 5;
const HEATMAP_OFFSET_M = 0.15;
const MIN_AREA_M2 = 0.5;

export type Scene3DInput = {
  title: string;
  dateLabel: string;
  origin: { lat: number; lng: number };
  focused: FocusedBuilding;
  patches: SurfacePatch[];
};

type Rings = Pt[][];

function localPolygons(geometry: any, frame: LocalFrame, box: Box): Rings[] {
  const out: Rings[] = [];
  for (const poly of allPolygonRings(geometry)) {
    const [outer, ...holes] = poly.map((ring) =>
      clipRingToBox(openRing(ring).map(([lng, lat]) => frame.toLocal(lng, lat)), box),
    );
    const valid = (ring: Pt[] | undefined) => !!ring && ring.length >= 3 && Math.abs(ringArea(ring)) >= MIN_AREA_M2;
    if (valid(outer)) out.push([outer, ...holes.filter(valid)]);
  }
  return out;
}

function triangulate(rings: Rings, z: number): Pt3[][] {
  const flat: number[] = [];
  const holes: number[] = [];
  rings.forEach((ring, i) => {
    if (i > 0) holes.push(flat.length / 2);
    for (const [x, y] of ring) flat.push(x, y);
  });
  const idx = earcut(flat, holes);
  const tris: Pt3[][] = [];
  for (let i = 0; i < idx.length; i += 3) {
    tris.push([idx[i], idx[i + 1], idx[i + 2]].map((k) => [flat[k * 2], flat[k * 2 + 1], z] as Pt3));
  }
  return tris;
}

function onBoxEdge(a: Pt, b: Pt, box: Box, outer: number): boolean {
  const eps = 1e-6;
  const same = (v1: number, v2: number, line: number) =>
    Math.abs(v1 - line) < eps && Math.abs(v2 - line) < eps && Math.abs(Math.abs(line) - outer) > eps;
  return (
    same(a[0], b[0], box.minX) || same(a[0], b[0], box.maxX) || same(a[1], b[1], box.minY) || same(a[1], b[1], box.maxY)
  );
}

/** Roof, walls and base of a vertical prism; walls on internal tile seams are left out. */
function prismFaces(rings: Rings, bottom: number, top: number, seamBox: Box | null, outer: number): SceneFace[] {
  const faces: SceneFace[] = [];
  for (const tri of triangulate(rings, top)) faces.push({ kind: "roof", pts: tri });
  for (const tri of triangulate(rings, bottom)) faces.push({ kind: "base", pts: tri.reverse() });
  rings.forEach((ring, ringIndex) => {
    const sign = Math.sign(ringArea(ring)) * (ringIndex === 0 ? 1 : -1);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05 || (seamBox && onBoxEdge(a, b, seamBox, outer))) continue;
      const normal: Pt = [((b[1] - a[1]) / len) * sign, (-(b[0] - a[0]) / len) * sign];
      faces.push({
        kind: "wall",
        normal,
        pts: [
          [a[0], a[1], bottom],
          [b[0], b[1], bottom],
          [b[0], b[1], top],
          [a[0], a[1], top],
        ],
      });
    }
  });
  return faces;
}

const OVERLAP_SHARE = 0.5;

/** True when most of the shape (its centre and points just inside each corner) lies within the footprint. */
function mostlyInside(rings: Rings, footprint: Rings[]): boolean {
  const outer = rings[0];
  const [cx, cy] = ringCentroid(outer);
  const samples: Pt[] = [[cx, cy], ...outer.map(([x, y]) => [x + (cx - x) * 0.15, y + (cy - y) * 0.15] as Pt)];
  const inside = samples.filter(([x, y]) => findHitPolygon(x, y, { type: "MultiPolygon", coordinates: footprint }) !== null);
  return inside.length / samples.length >= OVERLAP_SHARE;
}

function groundUnder(polygons: Rings[], grid: TerrainGrid): { mean: number; low: number; high: number } {
  const values: number[] = [];
  for (const rings of polygons) {
    const [cx, cy] = ringCentroid(rings[0]);
    values.push(gridHeight(grid, cx, cy), ...rings[0].map(([x, y]) => gridHeight(grid, x, y)));
    const xs = rings[0].map(([x]) => x);
    const ys = rings[0].map(([, y]) => y);
    const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = w + ((i + 0.5) / 4) * (e - w);
        const y = s + ((j + 0.5) / 4) * (n - s);
        if (findHitPolygon(x, y, { type: "Polygon", coordinates: rings })) values.push(gridHeight(grid, x, y));
      }
    }
  }
  return {
    mean: values.reduce((a, v) => a + v, 0) / values.length,
    low: Math.min(...values),
    high: Math.max(...values),
  };
}

function surroundingBuildings(
  tiles: MapTile[],
  frame: LocalFrame,
  grid: TerrainGrid,
  h: number,
  focused: FocusedBuilding,
): SceneFace[][] {
  const out: SceneFace[][] = [];
  const wideBox: Box = { minX: -2 * h, minY: -2 * h, maxX: 2 * h, maxY: 2 * h };
  const footprint = focused ? localPolygons(focused.geometry, frame, wideBox) : [];
  const groundAt = (lng: number, lat: number) => {
    const [x, y] = frame.toLocal(lng, lat);
    return gridHeight(grid, x, y);
  };

  const tileData = buildingsFromTiles(tiles);
  const prepared = tileData.map((tile) => prepareTile(tile, groundAt));
  const grounds = resolveGrounds(prepared);

  tileData.forEach((tile, ti) => {
    const [w, s, e, n] = tile.bounds;
    const [minX, minY] = frame.toLocal(w, s);
    const [maxX, maxY] = frame.toLocal(e, n);
    const box: Box = { minX: Math.max(minX, -h), minY: Math.max(minY, -h), maxX: Math.min(maxX, h), maxY: Math.min(maxY, h) };
    if (box.minX >= box.maxX || box.minY >= box.maxY) return;

    for (const piece of prepared[ti].pieces) {
      const { bottom, top } = seatPiece(piece, grounds[ti].ground[piece.group]);
      for (const rings of localPolygons({ type: "Polygon", coordinates: piece.rings }, frame, box)) {
        if (footprint.length > 0 && mostlyInside(rings, footprint)) continue;
        out.push(prismFaces(rings, bottom, top, box, h));
      }
    }
  });
  return out;
}

function selectedBody(focused: NonNullable<FocusedBuilding>, frame: LocalFrame, grid: TerrainGrid, h: number, hasHeatmap: boolean) {
  const box: Box = { minX: -h, minY: -h, maxX: h, maxY: h };
  const polygons = localPolygons(focused.geometry, frame, box);
  const [cx, cy] = frame.toLocal(focused.lng, focused.lat);
  const under = polygons.length > 0 ? groundUnder(polygons, grid) : null;
  const ground = under ? Math.max(under.mean, under.high - (1 - MIN_VISIBLE_SHARE) * focused.height) : gridHeight(grid, cx, cy);
  const faces: SceneFace[] = [];
  for (const rings of polygons) {
    const bottom = focused.baseHeight <= 0.01 ? Math.min(ground, under!.low) - BASE_EMBED_M : ground + focused.baseHeight;
    // The heatmap tiles already cover the visible building; only the footing below its ground level stays solid.
    const top = hasHeatmap ? Math.min(ground, ground + focused.height) : ground + focused.height;
    if (top - bottom > 0.05) faces.push(...prismFaces(rings, bottom, top, null, h));
  }
  return { ground, faces };
}

function heatmapFaces(patches: SurfacePatch[], frame: LocalFrame, ground: number): HeatmapFace[] {
  const out: HeatmapFace[] = [];
  for (const patch of patches) {
    const band = sunlightBandIndex(patch.hours);
    const rings: Rings = patch.geometry.coordinates.map((ring: number[][]) =>
      openRing(ring).map(([lng, lat]) => frame.toLocal(lng, lat)),
    );
    if (patch.type === "roof") {
      for (const tri of triangulate(rings, ground + patch.groundTop + HEATMAP_OFFSET_M)) out.push({ kind: "roof", band, pts: tri });
      continue;
    }
    const [p1, p2, , p4] = rings[0];
    if (!p4) continue;
    const len = Math.hypot(p4[0] - p1[0], p4[1] - p1[1]);
    if (len < 1e-6) continue;
    const normal: Pt = [(p4[0] - p1[0]) / len, (p4[1] - p1[1]) / len];
    const a: Pt = [p1[0] + normal[0] * HEATMAP_OFFSET_M, p1[1] + normal[1] * HEATMAP_OFFSET_M];
    const b: Pt = [p2[0] + normal[0] * HEATMAP_OFFSET_M, p2[1] + normal[1] * HEATMAP_OFFSET_M];
    const zb = ground + patch.groundBottom;
    const zt = ground + patch.groundTop;
    out.push({
      kind: "wall",
      band,
      normal,
      pts: [
        [a[0], a[1], zb],
        [b[0], b[1], zb],
        [b[0], b[1], zt],
        [a[0], a[1], zt],
      ],
    });
  }
  return out;
}

export function buildScene3D(
  input: Scene3DInput,
  tiles: MapTile[],
  sampler: TerrainSampler | null,
  h: number = SCENE_HALF_EXTENT_M,
): Scene3D {
  const { origin, focused } = input;
  const frame = createLocalFrame(origin.lng, origin.lat);
  const fallbackElevation = sampler?.(origin.lng, origin.lat) ?? 0;
  const outlines = outlinesFromTiles(tiles, { center: origin, halfExtentM: h });
  const wideWater = outlinesFromTiles(tiles, { center: origin, halfExtentM: h + TERRAIN_MARGIN_M }).water;
  const grid = sampleTerrainGrid(
    h,
    (x, y) => {
      if (!sampler) return 0;
      const [lng, lat] = frame.toLngLat(x, y);
      return sampler(lng, lat) ?? fallbackElevation;
    },
    !!sampler,
    wideWater,
  );
  const originElevation = gridHeight(grid, 0, 0);

  const drapePolys = (polys: Pt[][][]) => polys.map((rings) => rings.map((ring) => drapeLine(ring, grid, true)));

  const hasHeatmap = !!focused && input.patches.length > 0;
  const selected = focused ? selectedBody(focused, frame, grid, h, hasHeatmap) : null;

  return {
    title: input.title,
    dateLabel: input.dateLabel,
    halfExtentM: h,
    originElevation,
    hasTerrain: !!sampler,
    hasMap: tiles.length > 0,
    terrain: grid,
    contours: sampler ? traceContours(grid, CONTOUR_INTERVAL_M) : [],
    contourInterval: CONTOUR_INTERVAL_M,
    parks: drapePolys(outlines.parks),
    water: drapePolys(outlines.water),
    waterways: outlines.waterways.map((line) => drapeLine(line, grid)),
    roads: outlines.roads.map((r) => ({ cls: r.cls, widthM: r.widthM, line: drapeLine(r.line, grid) })),
    railways: outlines.railways.map((line) => drapeLine(line, grid)),
    buildings: surroundingBuildings(tiles, frame, grid, h, focused),
    selected: selected?.faces ?? [],
    heatmap: hasHeatmap && selected ? heatmapFaces(input.patches, frame, selected.ground) : [],
  };
}

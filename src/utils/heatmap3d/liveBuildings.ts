import { fetchVectorTile, buildingsFromTiles, MAP_TILE_ZOOM } from "../vectorExport/mapData";
import type { Box } from "../vectorExport/geometry";
import { clipPolygon, prepareTile, resolveGrounds, seatPiece, type PreparedPiece, type PreparedTile } from "./buildingSeating";
import { createLocalFrame, pointInPolygon, type Pt } from "./geometry";
import { preloadCleanTerrainBox } from "./terrain";
import { METERS_PER_DEG, type NearbyBuilding, type TerrainSampler } from "./types";

export const LIVE_BUILDING_LAYER = "3d-buildings";
const LIVE_SOURCE = "live-buildings";
const HIGHLIGHT_SOURCE = "focused-building-source";
const HIGHLIGHT_LAYER = "focused-building-highlight";

// The map cuts shapes at its own tile edges and seats every cut piece separately, so pieces are pre-cut on
// a grid fine enough that each one sits wholly inside a single map tile at every zoom.
const SOURCE_MAX_ZOOM = 17;
const SEAM_INSET_M = 0.06;
// No tile overlap or simplification, so each piece is drawn exactly once with exactly its own corners.
const SOURCE_OPTIONS = { maxzoom: SOURCE_MAX_ZOOM, tolerance: 0, buffer: 0 };
// The map only extends a ground-level wall 10 m below the terrain under the piece's centre.
const STRIP_RISE_M = 6;
const MAX_STRIPS = 16;
const LOAD_RING = 1;
const KEEP_RING = 1;
const MIN_LOAD_ZOOM = 13.5;

type RenderPiece = { piece: number; rings: Pt[][]; elev: number };
type LiveTile = { x: number; y: number; prepared: PreparedTile; render: RenderPiece[]; bounds: [number, number, number, number] };

export type LiveBuildings = {
  ensureLayers: () => void;
  refresh: () => void;
  /** Ground height the building under this point is seated at, or null if no loaded building covers it. */
  groundAt: (lng: number, lat: number) => number | null;
  nearby: (lng: number, lat: number, radiusM: number) => NearbyBuilding[];
  showHighlight: (lng: number, lat: number) => void;
  hideHighlight: () => void;
  destroy: () => void;
};

function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

function tileLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}

function tileLat(y: number, z: number) {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

function vertexAverage(rings: Pt[][]): Pt {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
      count++;
    }
  }
  return [sx / count, sy / count];
}

/** Cuts the polygon on the fine map-tile grid, pulled in slightly from each grid line. */
function cutOnSourceGrid(rings: Pt[][]): Pt[][][] {
  const z = SOURCE_MAX_ZOOM;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of rings[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const [x0, y1] = lngLatToTile(minX, minY, z);
  const [x1, y0] = lngLatToTile(maxX, maxY, z);
  const dLat = SEAM_INSET_M / METERS_PER_DEG;
  const dLng = dLat / Math.cos((minY * Math.PI) / 180);
  const out: Pt[][][] = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      const box: Box = {
        minX: tileLng(tx, z) + dLng,
        maxX: tileLng(tx + 1, z) - dLng,
        minY: tileLat(ty + 1, z) + dLat,
        maxY: tileLat(ty, z) - dLat,
      };
      const clipped = clipPolygon(rings, box);
      if (clipped) out.push(clipped);
    }
  }
  return out;
}

/** Splits a ground-level piece on a slope into bands across the slope so every band's walls reach the ground. */
function cutIntoStrips(rings: Pt[][], ground: TerrainSampler): Pt[][][] {
  const [clng, clat] = vertexAverage(rings);
  const frame = createLocalFrame(clng, clat);
  let low: { p: Pt; h: number } | null = null;
  let high: { p: Pt; h: number } | null = null;
  for (const [lng, lat] of rings[0]) {
    const h = ground(lng, lat);
    if (h === null) continue;
    const p = frame.toLocal(lng, lat);
    if (!low || h < low.h) low = { p, h };
    if (!high || h > high.h) high = { p, h };
  }
  if (!low || !high || high.h - low.h <= STRIP_RISE_M) return [rings];
  const dx = high.p[0] - low.p[0];
  const dy = high.p[1] - low.p[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return [rings];
  const [ux, uy] = [dx / len, dy / len];
  const toBand = ([x, y]: Pt): Pt => [x * ux + y * uy, -x * uy + y * ux];
  const fromBand = ([s, t]: Pt): Pt => frame.toLngLat(s * ux - t * uy, s * uy + t * ux);
  const banded = rings.map((r) => r.map(([lng, lat]) => toBand(frame.toLocal(lng, lat))));
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const [s] of banded[0]) {
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
  }
  const n = Math.min(MAX_STRIPS, Math.ceil((high.h - low.h) / STRIP_RISE_M));
  const width = (sMax - sMin) / n;
  const out: Pt[][][] = [];
  for (let i = 0; i < n; i++) {
    const box: Box = { minX: sMin + i * width, maxX: i === n - 1 ? sMax : sMin + (i + 1) * width, minY: -1e7, maxY: 1e7 };
    const local = clipPolygonLocal(banded, box);
    if (local) out.push(local.map((r) => r.map(fromBand)));
  }
  return out.length > 0 ? out : [rings];
}

function clipPolygonLocal(rings: Pt[][], box: Box): Pt[][] | null {
  const kx = METERS_PER_DEG;
  // clipPolygon measures area in degrees, so convert the metre band to pseudo-degrees and back.
  const scaled = rings.map((r) => r.map(([s, t]) => [s / kx, t / kx] as Pt));
  const clipped = clipPolygon(scaled, { minX: box.minX / kx, maxX: box.maxX / kx, minY: box.minY / kx, maxY: box.maxY / kx });
  return clipped ? clipped.map((r) => r.map(([s, t]) => [s * kx, t * kx] as Pt)) : null;
}

function renderPieces(pieces: PreparedPiece[], ground: TerrainSampler): RenderPiece[] {
  const out: RenderPiece[] = [];
  pieces.forEach((piece, index) => {
    for (const cell of cutOnSourceGrid(piece.rings)) {
      const parts = piece.onGround ? cutIntoStrips(cell, ground) : [cell];
      for (const rings of parts) {
        const [lng, lat] = vertexAverage(rings);
        out.push({ piece: index, rings, elev: ground(lng, lat) ?? 0 });
      }
    }
  });
  return out;
}

const closeRing = (ring: Pt[]) => [...ring, ring[0]];

export function createLiveBuildings(map: any, color: string, terrain: TerrainSampler | null): LiveBuildings {
  const tiles = new Map<string, LiveTile>();
  const loading = new Set<string>();
  let grounds = new Map<string, { ground: number[]; key: number[] }>();
  let features: any[] = [];
  let highlight: any[] = [];
  let destroyed = false;
  const sampler: TerrainSampler = terrain ?? (() => 0);
  const groundFn = (lng: number, lat: number) => sampler(lng, lat) ?? 0;

  const sourceData = (list: any[]) => ({ type: "FeatureCollection", features: list });

  const ensureLayers = () => {
    if (!map.getSource(LIVE_SOURCE)) {
      map.addSource(LIVE_SOURCE, { type: "geojson", data: sourceData(features), ...SOURCE_OPTIONS });
    }
    if (!map.getLayer(LIVE_BUILDING_LAYER)) {
      map.addLayer({
        id: LIVE_BUILDING_LAYER,
        source: LIVE_SOURCE,
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": color,
          "fill-extrusion-height": ["get", "top"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": true,
        },
      });
    }
  };

  const rebuild = (centerKey: [number, number]) => {
    const [cx, cy] = centerKey;
    const active = [...tiles.entries()].filter(([, t]) => Math.abs(t.x - cx) <= KEEP_RING && Math.abs(t.y - cy) <= KEEP_RING);
    for (const [key] of [...tiles.entries()]) {
      if (!active.some(([k]) => k === key)) tiles.delete(key);
    }
    const resolved = resolveGrounds(active.map(([, t]) => t.prepared));
    grounds = new Map();
    const next: any[] = [];
    active.forEach(([key, t], ti) => {
      grounds.set(key, resolved[ti]);
      for (const r of t.render) {
        const piece = t.prepared.pieces[r.piece];
        const g = resolved[ti].ground[piece.group];
        const { bottom, top } = seatPiece(piece, g);
        const base = Math.max(0, bottom - r.elev);
        const height = top - r.elev;
        if (height - base < 0.1) continue;
        next.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: r.rings.map(closeRing) },
          properties: { base, top: height, bid: resolved[ti].key[piece.group] },
        });
      }
    });
    features = next;
    map.getSource(LIVE_SOURCE)?.setData(sourceData(features));
  };

  const loadTile = async (x: number, y: number): Promise<boolean> => {
    const key = `${x}/${y}`;
    if (tiles.has(key) || loading.has(key)) return false;
    loading.add(key);
    try {
      const tile = await fetchVectorTile(MAP_TILE_ZOOM, x, y);
      const [buildings] = buildingsFromTiles([{ x, y, tile }]);
      if (terrain) {
        const [w, s, e, n] = buildings.bounds;
        await preloadCleanTerrainBox(w, s, e, n);
      }
      if (destroyed) return false;
      const prepared = prepareTile(buildings, groundFn);
      tiles.set(key, { x, y, prepared, render: renderPieces(prepared.pieces, sampler), bounds: buildings.bounds });
      return true;
    } catch (err) {
      console.warn("Failed to load buildings for tile", key, err);
      return false;
    } finally {
      loading.delete(key);
    }
  };

  let pending = false;
  const refresh = () => {
    if (destroyed || pending || map.getZoom() < MIN_LOAD_ZOOM) return;
    pending = true;
    const c = map.getCenter();
    const center = lngLatToTile(c.lng, c.lat, MAP_TILE_ZOOM);
    const wanted: [number, number][] = [[center[0], center[1]]];
    for (let dx = -LOAD_RING; dx <= LOAD_RING; dx++) {
      for (let dy = -LOAD_RING; dy <= LOAD_RING; dy++) if (dx || dy) wanted.push([center[0] + dx, center[1] + dy]);
    }
    (async () => {
      let changed = false;
      for (const [x, y] of wanted) {
        if (await loadTile(x, y)) {
          changed = true;
          // Show each tile as soon as it is ready, nearest first, instead of waiting for all of them.
          if (!destroyed) rebuild(center);
        }
      }
      if (!changed && !destroyed) {
        const stale = [...tiles.values()].some((t) => Math.abs(t.x - center[0]) > KEEP_RING || Math.abs(t.y - center[1]) > KEEP_RING);
        if (stale) rebuild(center);
      }
    })().finally(() => {
      pending = false;
    });
  };

  const hit = (lng: number, lat: number): { tileKey: string; piece: PreparedPiece } | null => {
    let best: { tileKey: string; piece: PreparedPiece } | null = null;
    for (const [key, t] of tiles) {
      const [w, s, e, n] = t.bounds;
      if (lng < w || lng > e || lat < s || lat > n || !grounds.has(key)) continue;
      for (const piece of t.prepared.pieces) {
        if (!pointInPolygon(lng, lat, piece.rings)) continue;
        if (!best || (piece.onGround && !best.piece.onGround)) best = { tileKey: key, piece };
      }
    }
    return best;
  };

  const groundAt = (lng: number, lat: number) => {
    const h = hit(lng, lat);
    return h ? grounds.get(h.tileKey)!.ground[h.piece.group] : null;
  };

  const nearby = (lng: number, lat: number, radiusM: number): NearbyBuilding[] => {
    const dLat = radiusM / METERS_PER_DEG;
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    const out: NearbyBuilding[] = [];
    for (const [key, t] of tiles) {
      const g = grounds.get(key);
      if (!g) continue;
      for (const piece of t.prepared.pieces) {
        const [plng, plat] = piece.rings[0][0];
        if (Math.abs(plng - lng) > dLng || Math.abs(plat - lat) > dLat) continue;
        out.push({ footprint: piece.rings.map(closeRing), height: piece.top, groundElevation: g.ground[piece.group] });
      }
    }
    return out;
  };

  const hideHighlight = () => {
    highlight = [];
    if (map.getLayer(HIGHLIGHT_LAYER)) map.removeLayer(HIGHLIGHT_LAYER);
    if (map.getSource(HIGHLIGHT_SOURCE)) map.removeSource(HIGHLIGHT_SOURCE);
  };

  const showHighlight = (lng: number, lat: number) => {
    hideHighlight();
    const h = hit(lng, lat);
    if (!h) return;
    const bid = grounds.get(h.tileKey)!.key[h.piece.group];
    highlight = features
      .filter((f) => f.properties.bid === bid)
      .map((f) => ({ ...f, properties: { ...f.properties, top: f.properties.top + 0.2 } }));
    map.addSource(HIGHLIGHT_SOURCE, { type: "geojson", data: sourceData(highlight), ...SOURCE_OPTIONS });
    map.addLayer({
      id: HIGHLIGHT_LAYER,
      source: HIGHLIGHT_SOURCE,
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#9aaab8",
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 1,
      },
    });
  };

  const onMoveEnd = () => refresh();
  map.on("moveend", onMoveEnd);

  return {
    ensureLayers,
    refresh,
    groundAt,
    nearby,
    showHighlight,
    hideHighlight,
    destroy: () => {
      destroyed = true;
      map.off("moveend", onMoveEnd);
    },
  };
}

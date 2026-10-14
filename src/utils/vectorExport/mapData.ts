import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader as Pbf } from "pbf";
import type { LocalFrame } from "../heatmap3d/geometry";
import { clipLine, clipRing, diagramFrame } from "./geometry";
import type { DiagramSpec, MapOutlines, PolygonRings, Pt, RoadClass, StreetLabel } from "./types";

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
export const MAP_TILE_ZOOM = 14;
const LABEL_MIN_LENGTH_M = 40;

const ROAD_STYLE: Record<string, { cls: RoadClass; widthM: number }> = {
  motorway: { cls: "major", widthM: 14 },
  trunk: { cls: "major", widthM: 12 },
  primary: { cls: "major", widthM: 11 },
  secondary: { cls: "major", widthM: 9 },
  tertiary: { cls: "minor", widthM: 8 },
  minor: { cls: "minor", widthM: 6 },
  service: { cls: "minor", widthM: 4 },
  track: { cls: "path", widthM: 2.5 },
  path: { cls: "path", widthM: 2 },
};
const RAIL_CLASSES = new Set(["rail", "transit"]);
const GREEN_LANDCOVER = new Set(["grass", "wood", "farmland", "wetland"]);

async function tileUrlTemplate(): Promise<string> {
  const res = await fetch(TILEJSON_URL);
  if (!res.ok) throw new Error(`Map index unavailable (${res.status})`);
  const json: unknown = await res.json();
  const tiles = (json as { tiles?: unknown }).tiles;
  if (!Array.isArray(tiles) || typeof tiles[0] !== "string") throw new Error("Map index has no tiles");
  return tiles[0];
}

function tileRange(frame: LocalFrame, h: number): { x0: number; x1: number; y0: number; y1: number } {
  const n = 2 ** MAP_TILE_ZOOM;
  const [west, south] = frame.toLngLat(-h, -h);
  const [east, north] = frame.toLngLat(h, h);
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  return { x0: tx(west), x1: tx(east), y0: ty(north), y1: ty(south) };
}

function polygonsOf(geometry: any, frame: LocalFrame, h: number): PolygonRings[] {
  const polys: number[][][][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  const out: PolygonRings[] = [];
  for (const poly of polys) {
    const rings = poly
      .map((ring) => clipRing(ring.slice(0, -1).map(([lng, lat]) => frame.toLocal(lng, lat)), h))
      .filter((r) => r.length >= 3);
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

function linesOf(geometry: any, frame: LocalFrame, h: number): Pt[][] {
  const lines: number[][][] =
    geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  return lines.flatMap((line) => clipLine(line.map(([lng, lat]) => frame.toLocal(lng, lat)), h));
}

function longestSegmentLabel(text: string, lines: Pt[][]): StreetLabel | null {
  let best: StreetLabel | null = null;
  let bestLen = LABEL_MIN_LENGTH_M;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len <= bestLen) continue;
      bestLen = len;
      let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      best = { text, x: (ax + bx) / 2, y: (ay + by) / 2, angleDeg: angle };
    }
  }
  return best;
}

export type MapTile = { x: number; y: number; tile: VectorTile };

let templatePromise: Promise<string> | null = null;
const tileRequests = new Map<string, Promise<VectorTile>>();
const MAX_CACHED_TILES = 64;

function cachedTemplate(): Promise<string> {
  if (!templatePromise) {
    templatePromise = tileUrlTemplate();
    templatePromise.catch(() => {
      templatePromise = null;
    });
  }
  return templatePromise;
}

/** Downloads one map tile; recent tiles are kept so the live view and exports don't refetch them. */
export function fetchVectorTile(z: number, x: number, y: number): Promise<VectorTile> {
  const key = `${z}/${x}/${y}`;
  const existing = tileRequests.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const template = await cachedTemplate();
    const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Map tile unavailable (${res.status})`);
    return new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
  })();
  tileRequests.set(key, promise);
  promise.catch(() => tileRequests.delete(key));
  if (tileRequests.size > MAX_CACHED_TILES) tileRequests.delete(tileRequests.keys().next().value as string);
  return promise;
}

export function fetchMapTilesAt(coords: { x: number; y: number }[]): Promise<MapTile[]> {
  return Promise.all(coords.map(async ({ x, y }) => ({ x, y, tile: await fetchVectorTile(MAP_TILE_ZOOM, x, y) })));
}

/** Downloads the map tiles covering the square. */
export function fetchMapTiles(spec: Pick<DiagramSpec, "center" | "halfExtentM">): Promise<MapTile[]> {
  const { x0, x1, y0, y1 } = tileRange(diagramFrame(spec), spec.halfExtentM);
  const coords: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) coords.push({ x, y });
  }
  return fetchMapTilesAt(coords);
}

function eachFeature(
  { x, y, tile }: MapTile,
  layer: string,
  fn: (props: any, geometry: any, id: number | undefined) => void,
): void {
  const l = tile.layers[layer];
  if (!l) return;
  for (let i = 0; i < l.length; i++) {
    const f = l.feature(i);
    fn(f.properties, f.toGeoJSON(x, y, MAP_TILE_ZOOM).geometry, f.id);
  }
}

export async function fetchMapOutlines(spec: Pick<DiagramSpec, "center" | "halfExtentM">): Promise<MapOutlines> {
  return outlinesFromTiles(await fetchMapTiles(spec), spec);
}

export function outlinesFromTiles(tiles: MapTile[], spec: Pick<DiagramSpec, "center" | "halfExtentM">): MapOutlines {
  const frame = diagramFrame(spec);
  const h = spec.halfExtentM;
  const out: MapOutlines = { parks: [], water: [], waterways: [], buildings: [], roads: [], railways: [], labels: [] };
  const namedLines = new Map<string, Pt[][]>();

  for (const tile of tiles) {
    eachFeature(tile, "park", (_p, g) => out.parks.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, "landcover", (p, g) => {
      if (GREEN_LANDCOVER.has(p.class)) out.parks.push(...polygonsOf(g, frame, h));
    });
    eachFeature(tile, "water", (_p, g) => out.water.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, "waterway", (_p, g) => out.waterways.push(...linesOf(g, frame, h)));
    eachFeature(tile, "building", (_p, g) => out.buildings.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, "transportation", (p, g) => {
      if (p.brunnel === "tunnel") return;
      const lines = linesOf(g, frame, h);
      if (RAIL_CLASSES.has(p.class)) {
        out.railways.push(...lines);
        return;
      }
      const style = ROAD_STYLE[p.class];
      if (!style) return;
      for (const line of lines) out.roads.push({ ...style, line });
    });
    eachFeature(tile, "transportation_name", (p, g) => {
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!name) return;
      const lines = linesOf(g, frame, h);
      if (lines.length > 0) namedLines.set(name, [...(namedLines.get(name) ?? []), ...lines]);
    });
  }

  for (const [name, lines] of namedLines) {
    const label = longestSegmentLabel(name, lines);
    if (label) out.labels.push(label);
  }

  return out;
}

export type TileBuildings = {
  /** Exact tile edges as [west, south, east, north]; features run slightly past them into the tile buffer. */
  bounds: [number, number, number, number];
  features: { id: number | undefined; type: "Feature"; geometry: any; properties: any }[];
};

export function buildingsFromTiles(tiles: MapTile[]): TileBuildings[] {
  const n = 2 ** MAP_TILE_ZOOM;
  const lngAt = (x: number) => (x / n) * 360 - 180;
  const latAt = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return tiles.map((tile) => {
    const features: TileBuildings["features"] = [];
    eachFeature(tile, "building", (properties, geometry, id) => features.push({ id, type: "Feature", geometry, properties }));
    return { bounds: [lngAt(tile.x), latAt(tile.y + 1), lngAt(tile.x + 1), latAt(tile.y)], features };
  });
}

export function emptyMapOutlines(): MapOutlines {
  return { parks: [], water: [], waterways: [], buildings: [], roads: [], railways: [], labels: [] };
}

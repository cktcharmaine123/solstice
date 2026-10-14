import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader as Pbf } from "pbf";
import type { LocalFrame } from "../heatmap3d/geometry";
import { clipLine, clipRing, diagramFrame } from "./geometry";
import type { DiagramSpec, MapOutlines, PolygonRings, Pt, RoadClass, StreetLabel } from "./types";

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const TILE_ZOOM = 14;
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
  const n = 2 ** TILE_ZOOM;
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

export async function fetchMapOutlines(spec: Pick<DiagramSpec, "center" | "halfExtentM">): Promise<MapOutlines> {
  const frame = diagramFrame(spec);
  const h = spec.halfExtentM;
  const template = await tileUrlTemplate();
  const { x0, x1, y0, y1 } = tileRange(frame, h);

  const requests: Promise<{ x: number; y: number; tile: VectorTile }>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const url = template.replace("{z}", String(TILE_ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
      requests.push(
        fetch(url).then(async (res) => {
          if (!res.ok) throw new Error(`Map tile unavailable (${res.status})`);
          return { x, y, tile: new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer()))) };
        }),
      );
    }
  }
  const tiles = await Promise.all(requests);

  const out: MapOutlines = { parks: [], water: [], waterways: [], buildings: [], roads: [], railways: [], labels: [] };
  const namedLines = new Map<string, Pt[][]>();

  const eachFeature = (tile: VectorTile, x: number, y: number, layer: string, fn: (props: any, geometry: any) => void) => {
    const l = tile.layers[layer];
    if (!l) return;
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i);
      fn(f.properties, f.toGeoJSON(x, y, TILE_ZOOM).geometry);
    }
  };

  for (const { x, y, tile } of tiles) {
    eachFeature(tile, x, y, "park", (_p, g) => out.parks.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, x, y, "landcover", (p, g) => {
      if (GREEN_LANDCOVER.has(p.class)) out.parks.push(...polygonsOf(g, frame, h));
    });
    eachFeature(tile, x, y, "water", (_p, g) => out.water.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, x, y, "waterway", (_p, g) => out.waterways.push(...linesOf(g, frame, h)));
    eachFeature(tile, x, y, "building", (_p, g) => out.buildings.push(...polygonsOf(g, frame, h)));
    eachFeature(tile, x, y, "transportation", (p, g) => {
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
    eachFeature(tile, x, y, "transportation_name", (p, g) => {
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

export function emptyMapOutlines(): MapOutlines {
  return { parks: [], water: [], waterways: [], buildings: [], roads: [], railways: [], labels: [] };
}

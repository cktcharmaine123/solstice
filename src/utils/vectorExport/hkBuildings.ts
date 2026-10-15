import { tileBounds, type TileBuildings } from "./mapData";

const QUERY_URL =
  "https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637211194312_35158/FeatureServer/0/query";
const PAGE_SIZE = 2000;
const MAX_PAGES = 10;
// Sheds and other temporary structures are recorded without heights.
const UNMEASURED_HEIGHT_M = 3;
const MAX_CACHED_TILES = 64;

export const HK_BUILDINGS_CREDIT = "Building data (c) Lands Department, HKSAR Government";

// Rough outline of Hong Kong's boundary as [lng, lat], following the middle of Deep Bay and the Shenzhen River.
const HK_BOUNDARY: [number, number][] = [
  [113.82, 22.13],
  [114.5, 22.13],
  [114.5, 22.56],
  [114.26, 22.565],
  [114.225, 22.548],
  [114.2, 22.558],
  [114.16, 22.558],
  [114.12, 22.542],
  [114.09, 22.537],
  [114.06, 22.512],
  [114.03, 22.512],
  [113.99, 22.505],
  [113.96, 22.48],
  [113.93, 22.455],
  [113.9, 22.43],
  [113.82, 22.38],
];

/** Precise enough to keep Shenzhen buildings on the usual map data. */
export function hasHkBuildingData(lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = HK_BOUNDARY.length - 1; i < HK_BOUNDARY.length; j = i++) {
    const [xi, yi] = HK_BOUNDARY[i];
    const [xj, yj] = HK_BOUNDARY[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type RawFeature = { id?: unknown; geometry?: any; properties?: Record<string, unknown> };

function heightOf(props: Record<string, unknown>): number {
  const top = Number(props.TopHeight);
  const base = Number(props.BaseHeight);
  const known = props.TopHeight != null && props.BaseHeight != null && Number.isFinite(top) && Number.isFinite(base);
  return known && top - base > 0.5 ? top - base : UNMEASURED_HEIGHT_M;
}

function toBuilding(f: RawFeature): TileBuildings["features"][number] | null {
  const type = f.geometry?.type;
  if (type !== "Polygon" && type !== "MultiPolygon") return null;
  const props = f.properties ?? {};
  const id = Number(props.OBJECTID ?? f.id);
  return {
    id: Number.isFinite(id) ? id : undefined,
    type: "Feature",
    geometry: f.geometry,
    properties: { render_height: heightOf(props), render_min_height: 0 },
  };
}

async function queryBox([w, s, e, n]: [number, number, number, number]): Promise<TileBuildings["features"]> {
  const out: TileBuildings["features"] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: `${w},${s},${e},${n}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID,BaseHeight,TopHeight",
      outSR: "4326",
      orderByFields: "OBJECTID",
      resultOffset: String(page * PAGE_SIZE),
      resultRecordCount: String(PAGE_SIZE),
      f: "geojson",
    });
    const res = await fetch(`${QUERY_URL}?${params}`);
    if (!res.ok) throw new Error(`Hong Kong building data unavailable (${res.status})`);
    const json: unknown = await res.json();
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) throw new Error("Hong Kong building data has an unexpected format");
    for (const f of features) {
      const b = toBuilding(f as RawFeature);
      if (b) out.push(b);
    }
    const more = (json as { properties?: { exceededTransferLimit?: boolean } }).properties?.exceededTransferLimit;
    if (!more && features.length < PAGE_SIZE) break;
  }
  return out;
}

const tileRequests = new Map<string, Promise<TileBuildings>>();

/** Government building outlines for one map tile, with heights above the ground; recent tiles are kept. */
export function fetchHkTileBuildings(x: number, y: number): Promise<TileBuildings> {
  const key = `${x}/${y}`;
  const existing = tileRequests.get(key);
  if (existing) return existing;
  const bounds = tileBounds(x, y);
  const promise = queryBox(bounds).then((features) => ({ bounds, features }));
  tileRequests.set(key, promise);
  promise.catch(() => tileRequests.delete(key));
  if (tileRequests.size > MAX_CACHED_TILES) tileRequests.delete(tileRequests.keys().next().value as string);
  return promise;
}

/** Government buildings for the given map tiles, or null when the service could not supply all of them. */
export async function fetchHkBuildingsForTiles(tiles: { x: number; y: number }[]): Promise<TileBuildings[] | null> {
  try {
    return await Promise.all(tiles.map(({ x, y }) => fetchHkTileBuildings(x, y)));
  } catch (err) {
    console.warn("Hong Kong building data failed, using map buildings:", err);
    return null;
  }
}

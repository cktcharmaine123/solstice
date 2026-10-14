import { fetchVectorTile } from "../vectorExport/mapData";
import { cleanGroundHeights } from "./groundCleanup";
import type { TerrainSampler } from "./types";

const TERRAIN_TILE_SIZE = 256;

type TileCache = Map<string, Float32Array>;
const tileCache: TileCache = new Map();

function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

function lngLatToTileXY(lng: number, lat: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const tileLngLeft = (x / n) * 360 - 180;
  const tileLngRight = ((x + 1) / n) * 360 - 180;
  const tileLatTop = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const tileLatBottom = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  const px = ((lng - tileLngLeft) / (tileLngRight - tileLngLeft)) * TERRAIN_TILE_SIZE;
  const py = ((lat - tileLatTop) / (tileLatBottom - tileLatTop)) * TERRAIN_TILE_SIZE;
  return { x, y, px, py };
}

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

const inflightTiles: Map<string, Promise<Float32Array | null>> = new Map();

async function fetchTerrainTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = tileKey(z, x, y);
  const cached = tileCache.get(key);
  if (cached) return cached;

  const existing = inflightTiles.get(key);
  if (existing) return existing;

  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const promise = (async () => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = TERRAIN_TILE_SIZE;
      canvas.height = TERRAIN_TILE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
      const data = imageData.data;
      const elevations = new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
      for (let i = 0; i < TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE; i++) {
        elevations[i] = decodeTerrarium(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      }
      tileCache.set(key, elevations);
      inflightTiles.delete(key);
      return elevations;
    } catch {
      inflightTiles.delete(key);
      return null;
    }
  })();

  inflightTiles.set(key, promise);
  return promise;
}

const EARTH_CIRCUMFERENCE_M = 40075016.686;
/** Zoom of the ground the live 3D view shows; the map never asks for more detailed ground than this. */
export const LIVE_TERRAIN_ZOOM = 13;
/** Coarser ground tiles are only seen far away, where cleanup would erase real hills. */
const CLEAN_MIN_ZOOM = 12;
const MAX_VECTOR_ZOOM = 14;

const cleanCache: TileCache = new Map();
const cleanInflight: Map<string, Promise<Float32Array | null>> = new Map();

function tileCenterLat(z: number, y: number): number {
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / Math.pow(2, z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Marks pixels inside the tile's water areas, written into a larger mosaic at the given offset. */
async function rasterizeWater(z: number, x: number, y: number, mask: Uint8Array, size: number, offX: number, offY: number) {
  if (z > MAX_VECTOR_ZOOM) return;
  let tile;
  try {
    tile = await fetchVectorTile(z, x, y);
  } catch {
    return;
  }
  const layer = tile.layers["water"];
  if (!layer) return;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    const scale = TERRAIN_TILE_SIZE / f.extent;
    const rings = f.loadGeometry().map((ring) => ring.map((p) => [p.x * scale, p.y * scale]));
    for (let py = 0; py < TERRAIN_TILE_SIZE; py++) {
      const sy = py + 0.5;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let k = 0; k < ring.length; k++) {
          const [ax, ay] = ring[k];
          const [bx, by] = ring[(k + 1) % ring.length];
          if ((ay <= sy) !== (by <= sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5));
        const to = Math.min(TERRAIN_TILE_SIZE - 1, Math.floor(xs[k + 1] - 0.5));
        for (let px = from; px <= to; px++) mask[(offY + py) * size + offX + px] = 1;
      }
    }
  }
}

/** Ground tile with building bumps and stray pits removed and water flattened at its shore height. */
function fetchCleanTerrainTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  if (z < CLEAN_MIN_ZOOM) return fetchTerrainTile(z, x, y);
  const key = tileKey(z, x, y);
  const cached = cleanCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = cleanInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const T = TERRAIN_TILE_SIZE;
    const size = T * 3;
    const n = Math.pow(2, z);
    const neighbours: { dx: number; dy: number; tx: number; ty: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) neighbours.push({ dx, dy, tx: (x + dx + n) % n, ty: Math.min(n - 1, Math.max(0, y + dy)) });
    }
    const raws = await Promise.all(neighbours.map((t) => fetchTerrainTile(z, t.tx, t.ty)));
    const center = raws[4];
    if (!center) return null;
    const mosaic = new Float32Array(size * size);
    const mask = new Uint8Array(size * size);
    neighbours.forEach(({ dx, dy }, i) => {
      const src = raws[i];
      for (let r = 0; r < T; r++) {
        for (let c = 0; c < T; c++) {
          const v = src
            ? src[r * T + c]
            : center[Math.min(T - 1, Math.max(0, r + dy * T)) * T + Math.min(T - 1, Math.max(0, c + dx * T))];
          mosaic[((dy + 1) * T + r) * size + (dx + 1) * T + c] = v;
        }
      }
    });
    await Promise.all(neighbours.map((t) => rasterizeWater(z, t.tx, t.ty, mask, size, (t.dx + 1) * T, (t.dy + 1) * T)));
    const step = (EARTH_CIRCUMFERENCE_M * Math.cos((tileCenterLat(z, y) * Math.PI) / 180)) / (T * n);
    const cleaned = cleanGroundHeights(mosaic, size, step, mask);
    const out = new Float32Array(T * T);
    for (let r = 0; r < T; r++) {
      for (let c = 0; c < T; c++) out[r * T + c] = cleaned[(T + r) * size + T + c];
    }
    cleanCache.set(key, out);
    return out;
  })().catch(() => null).finally(() => cleanInflight.delete(key));

  cleanInflight.set(key, promise);
  return promise;
}

async function encodeTerrarium(heights: Float32Array): Promise<ArrayBuffer> {
  const T = TERRAIN_TILE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = T;
  canvas.height = T;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const image = ctx.createImageData(T, T);
  for (let i = 0; i < T * T; i++) {
    const v = Math.min(65535.99, Math.max(0, heights[i] + 32768));
    image.data[i * 4] = Math.floor(v / 256);
    image.data[i * 4 + 1] = Math.floor(v) % 256;
    image.data[i * 4 + 2] = Math.floor((v - Math.floor(v)) * 256);
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode ground tile");
  return blob.arrayBuffer();
}

export const CLEAN_TERRAIN_PROTOCOL = "cleandem";

/** Serves cleaned ground tiles to the map at cleandem://{z}/{x}/{y}; works with both callback and promise style map versions. */
export function registerCleanTerrainProtocol(maplibregl: any): void {
  const load = async (url: string): Promise<ArrayBuffer> => {
    const match = /(\d+)\/(\d+)\/(\d+)/.exec(url);
    if (!match) throw new Error(`Bad ground tile address ${url}`);
    const heights = await fetchCleanTerrainTile(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!heights) throw new Error("Ground tile unavailable");
    return encodeTerrarium(heights);
  };
  try {
    maplibregl.removeProtocol?.(CLEAN_TERRAIN_PROTOCOL);
  } catch {
    /* not registered yet */
  }
  maplibregl.addProtocol(CLEAN_TERRAIN_PROTOCOL, (params: { url: string }, callback?: (err: unknown, data?: ArrayBuffer) => void) => {
    const result = load(params.url);
    if (typeof callback === "function") {
      result.then((data) => callback(null, data), (err) => callback(err));
      return { cancel: () => {} };
    }
    return result.then((data) => ({ data }));
  });
}

/** Ground height from the cleaned tiles the live view shows; null where those aren't loaded yet. */
export function createCleanTerrainSampler(zoom: number = LIVE_TERRAIN_ZOOM): TerrainSampler {
  return (lng: number, lat: number): number | null => {
    const { x, y, px, py } = lngLatToTileXY(lng, lat, zoom);
    const tile = cleanCache.get(tileKey(zoom, x, y));
    if (!tile) return null;
    return bilinearSample(tile, px, py);
  };
}

/** Loads the cleaned ground tiles touching the lng/lat box; false if any failed. */
export async function preloadCleanTerrainBox(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number = LIVE_TERRAIN_ZOOM,
): Promise<boolean> {
  const a = lngLatToTileXY(west, north, zoom);
  const b = lngLatToTileXY(east, south, zoom);
  const promises: Promise<Float32Array | null>[] = [];
  for (let x = a.x; x <= b.x; x++) {
    for (let y = a.y; y <= b.y; y++) promises.push(fetchCleanTerrainTile(zoom, x, y));
  }
  const tiles = await Promise.all(promises);
  return tiles.every((t) => t !== null);
}

function bilinearSample(elevations: Float32Array, px: number, py: number): number {
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, TERRAIN_TILE_SIZE - 1);
  const y1 = Math.min(y0 + 1, TERRAIN_TILE_SIZE - 1);
  const fx = px - x0;
  const fy = py - y0;

  const v00 = elevations[y0 * TERRAIN_TILE_SIZE + x0];
  const v10 = elevations[y0 * TERRAIN_TILE_SIZE + x1];
  const v01 = elevations[y1 * TERRAIN_TILE_SIZE + x0];
  const v11 = elevations[y1 * TERRAIN_TILE_SIZE + x1];

  const top = v00 * (1 - fx) + v10 * fx;
  const bottom = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bottom * fy;
}

const ZOOM = 12;
export const DETAILED_TERRAIN_ZOOM = 15;

export function createTerrainSampler(zoom: number = ZOOM): TerrainSampler {
  return (lng: number, lat: number): number | null => {
    const { x, y, px, py } = lngLatToTileXY(lng, lat, zoom);
    const tile = tileCache.get(tileKey(zoom, x, y));
    if (!tile) return null;
    return bilinearSample(tile, px, py);
  };
}

/** Loads every tile touching the lng/lat box; false if any of them failed. */
export async function preloadTerrainBox(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
): Promise<boolean> {
  const a = lngLatToTileXY(west, north, zoom);
  const b = lngLatToTileXY(east, south, zoom);
  const promises: Promise<Float32Array | null>[] = [];
  for (let x = a.x; x <= b.x; x++) {
    for (let y = a.y; y <= b.y; y++) promises.push(fetchTerrainTile(zoom, x, y));
  }
  const tiles = await Promise.all(promises);
  return tiles.every((t) => t !== null);
}

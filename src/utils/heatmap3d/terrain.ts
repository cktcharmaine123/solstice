import type { TerrainSampler } from "./types";

const TERRAIN_TILE_SIZE = 256;
const TERRARIUM_RED = 256;
const TERRARIUM_GREEN = 256;
const TERRARIUM_BLUE = 256;

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
  return (r * TERRARIUM_RED + g * TERRARIUM_GREEN + b * TERRARIUM_BLUE) / 256 - 32768;
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

export function createTerrainSampler(): TerrainSampler {
  return (lng: number, lat: number): number | null => {
    const { x, y, px, py } = lngLatToTileXY(lng, lat, ZOOM);
    const tile = tileCache.get(tileKey(x, y));
    if (!tile) return null;
    return bilinearSample(tile, px, py);
  };
}

export async function preloadTerrainTiles(
  centerLng: number,
  centerLat: number,
  radiusTiles: number = 3,
): Promise<void> {
  const n = Math.pow(2, ZOOM);
  const cx = Math.floor(((centerLng + 180) / 360) * n);
  const latRad = (centerLat * Math.PI) / 180;
  const cy = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  const promises: Promise<Float32Array | null>[] = [];
  for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx < 0 || tx >= n || ty < 0 || ty >= n) continue;
      promises.push(fetchTerrainTile(ZOOM, tx, ty));
    }
  }
  await Promise.all(promises);
}

export function isTerrainReady(lng: number, lat: number): boolean {
  const { x, y } = lngLatToTileXY(lng, lat, ZOOM);
  return tileCache.has(tileKey(x, y));
}

export function clearTerrainCache(): void {
  tileCache.clear();
  inflightTiles.clear();
}

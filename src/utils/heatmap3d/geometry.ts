import { METERS_PER_DEG } from "./types";

export type Pt = [number, number];

export type LocalFrame = {
  toLocal: (lng: number, lat: number) => Pt;
  toLngLat: (x: number, y: number) => Pt;
};

/** Flat east/north metre coordinates around an origin; accurate over a few hundred metres. */
export function createLocalFrame(lng0: number, lat0: number): LocalFrame {
  const kx = METERS_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  return {
    toLocal: (lng, lat) => [(lng - lng0) * kx, (lat - lat0) * METERS_PER_DEG],
    toLngLat: (x, y) => [lng0 + x / kx, lat0 + y / METERS_PER_DEG],
  };
}

/** Drops the closing duplicate vertex so rings are open. */
export function openRing(ring: number[][]): Pt[] {
  const pts = ring.map((p) => [p[0], p[1]] as Pt);
  if (pts.length > 1) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  return pts;
}

export function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function ringCentroid(ring: Pt[]): Pt {
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-9) {
    const sx = ring.reduce((s, p) => s + p[0], 0);
    const sy = ring.reduce((s, p) => s + p[1], 0);
    return [sx / ring.length, sy / ring.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function polygonRings(geometry: any): number[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") {
    let largest: number[][][] = geometry.coordinates[0];
    let maxLen = largest[0].length;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) {
        largest = poly;
        maxLen = poly[0].length;
      }
    }
    return largest;
  }
  return [];
}

export function allPolygonRings(geometry: any): number[][][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

export function buildingCentroid(geometry: any): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return centroidOfCoords(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let largest: number[][] = geometry.coordinates[0][0];
    let maxLen = largest.length;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) {
        largest = poly[0];
        maxLen = poly[0].length;
      }
    }
    return centroidOfCoords(largest);
  }
  return null;
}

function centroidOfCoords(coords: number[][]): [number, number] | null {
  if (!coords || coords.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  for (const c of coords) {
    sumLng += c[0];
    sumLat += c[1];
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

export function pointInGeometry(lng: number, lat: number, geometry: any): boolean {
  const rings = polygonRings(geometry);
  return pointInPolygon(lng, lat, rings);
}

export function findHitPolygon(
  lng: number,
  lat: number,
  geometry: any,
): number[][][] | null {
  const allPolys = allPolygonRings(geometry);
  for (const rings of allPolys) {
    if (pointInPolygon(lng, lat, rings)) return rings;
  }
  return null;
}

export function polygonCentroid(rings: number[][][]): [number, number] | null {
  if (!rings || rings.length === 0) return null;
  return centroidOfCoords(rings[0]);
}

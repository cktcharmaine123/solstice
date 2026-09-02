import { METERS_PER_DEG } from "./types";

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

export function offsetPoint(lng: number, lat: number, dxMeters: number, dyMeters: number): [number, number] {
  const latRad = lat * Math.PI / 180;
  return [
    lng + dxMeters / (METERS_PER_DEG * Math.cos(latRad)),
    lat + dyMeters / METERS_PER_DEG,
  ];
}

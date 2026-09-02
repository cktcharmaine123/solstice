import { METERS_PER_DEG } from "./types";
import { polygonRings, pointInPolygon, offsetPoint } from "./geometry";

export function subdivideRoof(geometry: any, spacingMeters: number): { geometry: any; center: [number, number] }[] {
  const rings = polygonRings(geometry);
  if (rings.length === 0) return [];
  const outer = rings[0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [x, y] of outer) {
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  const midLat = (minLat + maxLat) / 2;
  const latStep = spacingMeters / METERS_PER_DEG;
  const lngStep = spacingMeters / (METERS_PER_DEG * Math.cos(midLat * Math.PI / 180));

  const patches: { geometry: any; center: [number, number] }[] = [];
  for (let lat = minLat + latStep / 2; lat < maxLat; lat += latStep) {
    for (let lng = minLng + lngStep / 2; lng < maxLng; lng += lngStep) {
      if (pointInPolygon(lng, lat, rings)) {
        const halfLng = lngStep / 2;
        const halfLat = latStep / 2;
        const patchRing = [
          [lng - halfLng, lat - halfLat],
          [lng + halfLng, lat - halfLat],
          [lng + halfLng, lat + halfLat],
          [lng - halfLng, lat + halfLat],
          [lng - halfLng, lat - halfLat],
        ];
        patches.push({
          geometry: { type: "Polygon", coordinates: [patchRing] },
          center: [lng, lat],
        });
      }
    }
  }
  return patches;
}

export function getWallSegments(geometry: any, buildingHeight: number, baseHeight: number, segmentLengthMeters: number): {
  wallDir: "north" | "south" | "east" | "west";
  centerLng: number;
  centerLat: number;
  segment: [number, number][];
}[] {
  const rings = polygonRings(geometry);
  if (rings.length === 0) return [];
  const outer = rings[0];
  const segments: {
    wallDir: "north" | "south" | "east" | "west";
    centerLng: number;
    centerLat: number;
    segment: [number, number][];
  }[] = [];

  for (let i = 0; i < outer.length - 1; i++) {
    const [lng1, lat1] = outer[i];
    const [lng2, lat2] = outer[i + 1];
    const midLat = (lat1 + lat2) / 2;
    const latRad = midLat * Math.PI / 180;

    const dxMeters = (lng2 - lng1) * METERS_PER_DEG * Math.cos(latRad);
    const dyMeters = (lat2 - lat1) * METERS_PER_DEG;
    const lenMeters = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters);
    if (lenMeters < 1) continue;

    const segCount = Math.max(1, Math.ceil(lenMeters / segmentLengthMeters));
    for (let s = 0; s < segCount; s++) {
      const t1 = s / segCount;
      const t2 = (s + 1) / segCount;
      const slng = lng1 + t1 * (lng2 - lng1);
      const slat = lat1 + t1 * (lat2 - lat1);
      const elng = lng1 + t2 * (lng2 - lng1);
      const elat = lat1 + t2 * (lat2 - lat1);
      const midLng = (slng + elng) / 2;
      const midLat2 = (slat + elat) / 2;

      const segDx = (elng - slng) * METERS_PER_DEG * Math.cos(midLat2 * Math.PI / 180);
      const segDy = (elat - slat) * METERS_PER_DEG;
      const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
      if (segLen < 0.5) continue;

      const segDxN = segDx / segLen;
      const segDyN = segDy / segLen;
      const normalX = -segDyN;
      const normalY = segDxN;

      let wallDir: "north" | "south" | "east" | "west";
      if (Math.abs(normalY) > Math.abs(normalX)) {
        wallDir = normalY > 0 ? "north" : "south";
      } else {
        wallDir = normalX > 0 ? "east" : "west";
      }

      segments.push({
        wallDir,
        centerLng: midLng,
        centerLat: midLat2,
        segment: [[slng, slat], [elng, elat]],
      });
    }
  }
  return segments;
}

export { offsetPoint };

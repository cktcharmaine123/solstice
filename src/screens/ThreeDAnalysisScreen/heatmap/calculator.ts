import * as SunCalc from "suncalc";
import {
  METERS_PER_DEG,
  type SurfacePatch,
  type NearbyBuilding,
  type HeatmapResult,
  type SunStep,
  type RoofPatch,
  type WallSegment,
} from "./types";

export function sunlightColor(hours: number): string {
  if (hours < 1) return "#3B82F6";
  if (hours < 4) return "#60A5FA";
  if (hours < 6) return "#FACC15";
  if (hours < 8) return "#F97316";
  return "#EF4444";
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

function offsetPoint(lng: number, lat: number, dxMeters: number, dyMeters: number): [number, number] {
  const latRad = lat * Math.PI / 180;
  return [
    lng + dxMeters / (METERS_PER_DEG * Math.cos(latRad)),
    lat + dyMeters / METERS_PER_DEG,
  ];
}

function subdivideRoof(geometry: any, spacingMeters: number): RoofPatch[] {
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

  const patches: RoofPatch[] = [];
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

function getWallSegments(geometry: any, segmentLengthMeters: number): WallSegment[] {
  const rings = polygonRings(geometry);
  if (rings.length === 0) return [];
  const outer = rings[0];
  const segments: WallSegment[] = [];

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

      let wallDir: WallSegment["wallDir"];
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

function isPointShadowedByBuilding(
  pointLng: number,
  pointLat: number,
  pointHeight: number,
  sunDirX: number,
  sunDirY: number,
  tanAlt: number,
  nearby: NearbyBuilding[],
): boolean {
  for (const nb of nearby) {
    const dLng = (nb.lng - pointLng) * METERS_PER_DEG * Math.cos(pointLat * Math.PI / 180);
    const dLat = (nb.lat - pointLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const heightAtPoint = nb.height - along * tanAlt;
    if (heightAtPoint < pointHeight) continue;
    return true;
  }
  return false;
}

function isWallSegmentShadowed(
  segLng: number,
  segLat: number,
  segHeight: number,
  wallNormalX: number,
  wallNormalY: number,
  sunDirX: number,
  sunDirY: number,
  tanAlt: number,
  nearby: NearbyBuilding[],
): boolean {
  const dot = sunDirX * wallNormalX + sunDirY * wallNormalY;
  if (dot <= 0) return true;

  for (const nb of nearby) {
    const dLng = (nb.lng - segLng) * METERS_PER_DEG * Math.cos(segLat * Math.PI / 180);
    const dLat = (nb.lat - segLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const heightAtPoint = nb.height - along * tanAlt;
    if (heightAtPoint < segHeight) continue;
    return true;
  }
  return false;
}

function precomputeSunSteps(
  sunriseMs: number,
  sunsetMs: number,
  totalSteps: number,
  buildingCenterLat: number,
  buildingCenterLng: number,
): SunStep[] {
  const sunSteps: SunStep[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    const stepTime = new Date(sunriseMs + (i / totalSteps) * (sunsetMs - sunriseMs));
    const pos = SunCalc.getPosition(stepTime, buildingCenterLat, buildingCenterLng);
    if (pos.altitude <= 0) {
      sunSteps.push({ altRad: 0, azRad: 0, tanAlt: 0, sunDirX: 0, sunDirY: 0 });
    } else {
      const altRad = pos.altitude * Math.PI / 180;
      const azRad = pos.azimuth * Math.PI / 180;
      sunSteps.push({
        altRad,
        azRad,
        tanAlt: Math.tan(altRad),
        sunDirX: Math.sin(azRad),
        sunDirY: Math.cos(azRad),
      });
    }
  }
  return sunSteps;
}

export function calculate3DHeatmap(
  buildingGeometry: any,
  buildingHeight: number,
  buildingBaseHeight: number,
  buildingCenterLng: number,
  buildingCenterLat: number,
  selectedDate: Date,
  nearbyBuildings: NearbyBuilding[],
  roofPatchSize: number = 5,
  wallSegmentSize: number = 8,
): HeatmapResult {
  const times = SunCalc.getTimes(selectedDate, buildingCenterLat, buildingCenterLng);
  if (!times.sunrise || !times.sunset || isNaN(times.sunrise.getTime()) || isNaN(times.sunset.getTime())) {
    return { patches: [], avgHours: 0 };
  }

  const sunriseMs = times.sunrise.getTime();
  const sunsetMs = times.sunset.getTime();
  if (sunsetMs <= sunriseMs) return { patches: [], avgHours: 0 };

  const STEP_MIN = 30;
  const totalSteps = Math.ceil((sunsetMs - sunriseMs) / (1000 * 60 * STEP_MIN));
  const dayLengthHours = (sunsetMs - sunriseMs) / (1000 * 60 * 60);

  const sunSteps = precomputeSunSteps(sunriseMs, sunsetMs, totalSteps, buildingCenterLat, buildingCenterLng);

  const patches: SurfacePatch[] = [];
  let totalHours = 0;
  let patchCount = 0;

  const roofPatches = subdivideRoof(buildingGeometry, roofPatchSize);
  for (let r = 0; r < roofPatches.length; r++) {
    const rp = roofPatches[r];
    const [clng, clat] = rp.center;
    let litSteps = 0;
    for (let i = 0; i <= totalSteps; i++) {
      const ss = sunSteps[i];
      if (ss.altRad === 0) continue;
      const blocked = isPointShadowedByBuilding(
        clng, clat, buildingHeight, ss.sunDirX, ss.sunDirY, ss.tanAlt, nearbyBuildings,
      );
      if (!blocked) litSteps++;
    }
    const hours = Math.round((litSteps / totalSteps) * dayLengthHours * 10) / 10;
    totalHours += hours;
    patchCount++;
    patches.push({
      id: `roof-${r}`,
      type: "roof",
      geometry: rp.geometry,
      baseHeight: buildingHeight,
      topHeight: buildingHeight + 0.5,
      hours,
      color: sunlightColor(hours),
    });
  }

  const wallSegs = getWallSegments(buildingGeometry, wallSegmentSize);
  for (let w = 0; w < wallSegs.length; w++) {
    const ws = wallSegs[w];
    let normalX = 0, normalY = 0;
    if (ws.wallDir === "north") { normalY = 1; }
    else if (ws.wallDir === "south") { normalY = -1; }
    else if (ws.wallDir === "east") { normalX = 1; }
    else { normalX = -1; }

    const wallMidHeight = (buildingBaseHeight + buildingHeight) / 2;
    let litSteps = 0;
    for (let i = 0; i <= totalSteps; i++) {
      const ss = sunSteps[i];
      if (ss.altRad === 0) continue;
      const blocked = isWallSegmentShadowed(
        ws.centerLng, ws.centerLat, wallMidHeight,
        normalX, normalY,
        ss.sunDirX, ss.sunDirY, ss.tanAlt,
        nearbyBuildings,
      );
      if (!blocked) litSteps++;
    }
    const hours = Math.round((litSteps / totalSteps) * dayLengthHours * 10) / 10;
    totalHours += hours;
    patchCount++;

    const halfLen = wallSegmentSize / 2;
    const latRad = ws.centerLat * Math.PI / 180;
    const segDx = (ws.segment[1][0] - ws.segment[0][0]) * METERS_PER_DEG * Math.cos(latRad);
    const segDy = (ws.segment[1][1] - ws.segment[0][1]) * METERS_PER_DEG;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    if (segLen < 0.5) continue;
    const ux = segDx / segLen;
    const uy = segDy / segLen;
    const p1 = offsetPoint(ws.centerLng, ws.centerLat, -ux * halfLen, -uy * halfLen);
    const p2 = offsetPoint(ws.centerLng, ws.centerLat, ux * halfLen, uy * halfLen);

    patches.push({
      id: `wall-${w}`,
      type: "wall",
      wallDir: ws.wallDir,
      geometry: { type: "Polygon", coordinates: [[p1, p2, p2, p1, p1]] },
      baseHeight: buildingBaseHeight,
      topHeight: buildingHeight,
      hours,
      color: sunlightColor(hours),
    });
  }

  return {
    patches,
    avgHours: patchCount > 0 ? Math.round((totalHours / patchCount) * 10) / 10 : 0,
  };
}

export function queryNearbyBuildings(
  map: any,
  centerLng: number,
  centerLat: number,
): NearbyBuilding[] {
  const nearbyBuildings: NearbyBuilding[] = [];
  if (!map || !map.getLayer("3d-buildings")) return nearbyBuildings;

  try {
    const centerPoint = map.project([centerLng, centerLat]);
    const features = map.queryRenderedFeatures(
      [
        [centerPoint.x - 300, centerPoint.y - 300],
        [centerPoint.x + 300, centerPoint.y + 300],
      ],
      { layers: ["3d-buildings"] }
    );
    const seen = new Set<string | number>();
    for (const f of features) {
      const fid = f.id ?? f.properties?.id ?? f.properties?.osm_id;
      if (fid !== undefined && seen.has(fid)) continue;
      if (fid !== undefined) seen.add(fid);
      const c = buildingCentroid(f.geometry);
      if (!c) continue;
      const h = Number(f.properties?.render_height ?? f.properties?.height ?? 15) || 15;
      const bh = Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0) || 0;
      const distM = Math.sqrt(
        Math.pow((c[0] - centerLng) * METERS_PER_DEG * Math.cos(centerLat * Math.PI / 180), 2) +
        Math.pow((c[1] - centerLat) * METERS_PER_DEG, 2)
      );
      if (distM < 5) continue;
      nearbyBuildings.push({ lat: c[1], lng: c[0], height: h, baseHeight: bh });
    }
  } catch (e) {
    console.warn("Failed to query nearby buildings:", e);
  }

  return nearbyBuildings;
}

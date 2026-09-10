import * as SunCalc from "suncalc";
import {
  METERS_PER_DEG,
  type NearbyBuilding,
  type SurfacePatch,
  type HeatmapResult,
  type TerrainSampler,
} from "./types";
import { subdivideRoof, getWallSegments, offsetPoint } from "./subdivision";
import { isPointShadowedByBuilding, isWallSegmentShadowed } from "./shadow";
import { sunlightColor } from "./color";

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
  terrainSampler?: TerrainSampler | null,
  buildingGroundElevation?: number,
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
  const sampleCount = totalSteps + 1;

  const sunSteps: { altRad: number; azRad: number; tanAlt: number; sunDirX: number; sunDirY: number }[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    const stepTime = new Date(sunriseMs + (i / totalSteps) * (sunsetMs - sunriseMs));
    const pos = SunCalc.getPosition(stepTime, buildingCenterLat, buildingCenterLng);

    if (pos.altitude <= 0) {
      sunSteps.push({ altRad: 0, azRad: 0, tanAlt: 0, sunDirX: 0, sunDirY: 0 });
    } else {
      const altRad = pos.altitude;
      const azRad = pos.azimuth;
      sunSteps.push({
        altRad,
        azRad,
        tanAlt: Math.tan(altRad),
        sunDirX: -Math.sin(azRad),
        sunDirY: -Math.cos(azRad),
      });
    }
  }

  const groundElev = buildingGroundElevation ?? (terrainSampler ? (terrainSampler(buildingCenterLng, buildingCenterLat) ?? 0) : 0);

  const patches: SurfacePatch[] = [];
  let totalHours = 0;
  let patchCount = 0;

  // --- ROOF PATCHES ---
  const roofPatches = subdivideRoof(buildingGeometry, roofPatchSize);
  for (let r = 0; r < roofPatches.length; r++) {
    const rp = roofPatches[r];
    const [clng, clat] = rp.center;
    let litSteps = 0;

    for (let i = 0; i < sampleCount; i++) {
      const ss = sunSteps[i];
      if (ss.altRad === 0) continue;
      const blocked = isPointShadowedByBuilding(
        clng, clat, buildingHeight, ss.sunDirX, ss.sunDirY, ss.tanAlt, nearbyBuildings,
        terrainSampler, groundElev,
      );
      if (!blocked) litSteps++;
    }

    const hours = Math.round((litSteps / sampleCount) * dayLengthHours * 10) / 10;
    totalHours += hours;
    patchCount++;

    patches.push({
      id: `roof-${r}`,
      type: "roof",
      geometry: rp.geometry,
      baseHeight: groundElev + buildingHeight,
      topHeight: groundElev + buildingHeight + 0.5,
      hours,
      color: sunlightColor(hours),
    });
  }

  // --- WALL SEGMENTS ---
  const wallSegs = getWallSegments(buildingGeometry, buildingHeight, buildingBaseHeight, wallSegmentSize);
  for (let w = 0; w < wallSegs.length; w++) {
    const ws = wallSegs[w];
    const latRad = ws.centerLat * Math.PI / 180;

    const segDx = (ws.segment[1][0] - ws.segment[0][0]) * METERS_PER_DEG * Math.cos(latRad);
    const segDy = (ws.segment[1][1] - ws.segment[0][1]) * METERS_PER_DEG;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);

    if (segLen < 0.5) continue;

    const ux = segDx / segLen;
    const uy = segDy / segLen;

    const normalX = uy;
    const normalY = -ux;

    const wallMidHeight = (buildingBaseHeight + buildingHeight) / 2;
    let litSteps = 0;

    for (let i = 0; i < sampleCount; i++) {
      const ss = sunSteps[i];
      if (ss.altRad === 0) continue;

      const blocked = isWallSegmentShadowed(
        ws.centerLng, ws.centerLat, wallMidHeight,
        normalX, normalY,
        ss.sunDirX, ss.sunDirY, ss.altRad, ss.tanAlt,
        nearbyBuildings,
        terrainSampler, groundElev,
      );
      if (!blocked) litSteps++;
    }

    const hours = Math.round((litSteps / sampleCount) * dayLengthHours * 10) / 10;
    totalHours += hours;
    patchCount++;

    const halfLen = wallSegmentSize / 2;

    const p1 = offsetPoint(ws.centerLng, ws.centerLat, -ux * halfLen, -uy * halfLen);
    const p2 = offsetPoint(ws.centerLng, ws.centerLat, ux * halfLen, uy * halfLen);

    const THICKNESS = 0.2;
    const offsetX = (normalX * THICKNESS) / (METERS_PER_DEG * Math.cos(latRad));
    const offsetY = (normalY * THICKNESS) / METERS_PER_DEG;

    const p3 = [p2[0] - offsetX, p2[1] - offsetY];
    const p4 = [p1[0] - offsetX, p1[1] - offsetY];

    patches.push({
      id: `wall-${w}`,
      type: "wall",
      geometry: { type: "Polygon", coordinates: [[p1, p2, p3, p4, p1]] },
      baseHeight: groundElev + buildingBaseHeight,
      topHeight: groundElev + buildingHeight,
      hours,
      color: sunlightColor(hours),
    });
  }

  return {
    patches,
    avgHours: patchCount > 0 ? Math.round((totalHours / patchCount) * 10) / 10 : 0,
  };
}

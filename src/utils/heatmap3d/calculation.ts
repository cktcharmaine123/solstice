import * as SunCalc from "suncalc";
import { type NearbyBuilding, type SurfacePatch, type HeatmapResult, type TerrainSampler } from "./types";
import { allPolygonRings, createLocalFrame, openRing, pointInPolygon, ringArea, type Pt } from "./geometry";
import { subdivideRoof, subdivideWalls } from "./subdivision";
import { buildHeightGrid, isBlockedByBuildings, isBlockedByTerrain, type Obstacle, type TerrainProfile } from "./shadow";
import { sunlightColor } from "./color";

const STEP_MIN = 15;
const GRID_HALF_EXTENT_M = 350;
const GRID_CELL_M = 1;
const ROOF_LIFT_M = 0.3;
const TERRAIN_NEAR_M = 40;
const TERRAIN_FAR_M = 2000;
const TERRAIN_STEP_M = 40;

type SunStep = { up: boolean; tanAlt: number; sunX: number; sunY: number; terrain: TerrainProfile | null };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function calculate3DHeatmap(
  buildingGeometry: any,
  buildingHeight: number,
  buildingBaseHeight: number,
  buildingCenterLng: number,
  buildingCenterLat: number,
  selectedDate: Date,
  nearbyBuildings: NearbyBuilding[],
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

  const frame = createLocalFrame(buildingCenterLng, buildingCenterLat);
  const ground = buildingGroundElevation ??
    (terrainSampler ? (terrainSampler(buildingCenterLng, buildingCenterLat) ?? 0) : 0);

  const parts: Pt[][][] = allPolygonRings(buildingGeometry)
    .map((poly) => poly
      .map((r) => openRing(r).map(([lng, lat]) => frame.toLocal(lng, lat)))
      .filter((r) => r.length >= 3))
    .filter((poly) => poly.length > 0);
  if (parts.length === 0) return { patches: [], avgHours: 0 };

  const obstacles: Obstacle[] = parts.map((rings) => ({ rings, top: ground + buildingHeight }));
  for (const nb of nearbyBuildings) {
    const nbRings = nb.footprint
      .map((r) => openRing(r).map(([lng, lat]) => frame.toLocal(lng, lat)))
      .filter((r) => r.length >= 3);
    if (nbRings.length > 0) obstacles.push({ rings: nbRings, top: nb.groundElevation + nb.height });
  }
  const grid = buildHeightGrid(obstacles, GRID_HALF_EXTENT_M, GRID_CELL_M);

  const totalSteps = Math.max(1, Math.ceil((sunsetMs - sunriseMs) / (1000 * 60 * STEP_MIN)));
  const dayLengthHours = (sunsetMs - sunriseMs) / (1000 * 60 * 60);
  const sampleCount = totalSteps + 1;
  const sunSteps: SunStep[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    const t = new Date(sunriseMs + (i / totalSteps) * (sunsetMs - sunriseMs));
    const pos = SunCalc.getPosition(t, buildingCenterLat, buildingCenterLng);
    // suncalc v2 reports degrees, with azimuth measured clockwise from north.
    const altRad = (pos.altitude * Math.PI) / 180;
    const azRad = (pos.azimuth * Math.PI) / 180;
    if (altRad <= 0.005) {
      sunSteps.push({ up: false, tanAlt: 0, sunX: 0, sunY: 0, terrain: null });
      continue;
    }
    const sunX = Math.sin(azRad);
    const sunY = Math.cos(azRad);
    let terrain: TerrainProfile | null = null;
    if (terrainSampler) {
      terrain = [];
      for (let d = TERRAIN_NEAR_M; d <= TERRAIN_FAR_M; d += TERRAIN_STEP_M) {
        const [lng, lat] = frame.toLngLat(sunX * d, sunY * d);
        const elev = terrainSampler(lng, lat);
        if (elev !== null) terrain.push({ dist: d, elev });
      }
    }
    sunSteps.push({ up: true, tanAlt: Math.tan(altRad), sunX, sunY, terrain });
  }

  const litHours = (x: number, y: number, z: number, normal?: Pt): number => {
    let lit = 0;
    for (const s of sunSteps) {
      if (!s.up) continue;
      if (normal && s.sunX * normal[0] + s.sunY * normal[1] <= 0) continue;
      if (isBlockedByBuildings(grid, x, y, z, s.sunX, s.sunY, s.tanAlt)) continue;
      if (isBlockedByTerrain(s.terrain, z, s.tanAlt)) continue;
      lit++;
    }
    return Math.round((lit / sampleCount) * dayLengthHours * 10) / 10;
  };

  // The map seats each extrusion on the terrain under its own centre, so cancel that per-patch offset.
  const terrainOffset = (x: number, y: number): number => {
    if (!terrainSampler) return 0;
    const [lng, lat] = frame.toLngLat(x, y);
    const e = terrainSampler(lng, lat);
    return e === null ? 0 : ground - e;
  };

  const toLngLatRing = (ring: Pt[]) => ring.map(([x, y]) => frame.toLngLat(x, y));
  const patches: SurfacePatch[] = [];
  let totalHours = 0;

  const footprintArea = parts.reduce((sum, rings) => sum + Math.abs(ringArea(rings[0])), 0);
  const roofCellSize = clamp(Math.sqrt(footprintArea / 700), 1.5, 5);
  const wallSpan = Math.max(1, buildingHeight - buildingBaseHeight);
  const perimeter = parts.reduce((total, rings) => total + rings.reduce((sum, r) => sum + r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0), 0), 0);
  const segmentLength = clamp(perimeter / 160, 1.5, 6);
  const bandHeight = clamp(wallSpan / 24, 3, 12);
  const insideOtherPart = (pt: Pt, self: number) =>
    parts.some((rings, j) => j !== self && pointInPolygon(pt[0], pt[1], rings));

  parts.forEach((rings, partIndex) => {
    subdivideRoof(rings, roofCellSize).forEach((cell, i) => {
      const hours = litHours(cell.sample[0], cell.sample[1], ground + buildingHeight + 0.2);
      const offset = terrainOffset(cell.sample[0], cell.sample[1]);
      totalHours += hours;
      patches.push({
        id: `roof-${partIndex}-${i}`,
        type: "roof",
        geometry: { type: "Polygon", coordinates: cell.rings.map(toLngLatRing) },
        baseHeight: buildingHeight + offset,
        topHeight: buildingHeight + ROOF_LIFT_M + offset,
        groundBottom: buildingHeight,
        groundTop: buildingHeight,
        hours,
        color: sunlightColor(hours),
      });
    });

    subdivideWalls(rings, buildingBaseHeight, buildingHeight, segmentLength, bandHeight).forEach((cell, i) => {
      // Seams where two pieces of the same building meet are interior, not real walls.
      if (insideOtherPart(cell.sample, partIndex)) return;
      const z = ground + (cell.bottom + cell.top) / 2;
      const hours = litHours(cell.sample[0], cell.sample[1], z, cell.normal);
      const offset = terrainOffset(cell.sample[0], cell.sample[1]);
      totalHours += hours;
      patches.push({
        id: `wall-${partIndex}-${i}`,
        type: "wall",
        geometry: { type: "Polygon", coordinates: [toLngLatRing(cell.quad)] },
        baseHeight: Math.max(0, cell.bottom + offset),
        topHeight: cell.top + offset,
        groundBottom: cell.bottom,
        groundTop: cell.top,
        hours,
        color: sunlightColor(hours),
      });
    });
  });

  return {
    patches,
    avgHours: patches.length > 0 ? Math.round((totalHours / patches.length) * 10) / 10 : 0,
  };
}

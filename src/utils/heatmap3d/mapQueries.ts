import { AVG_BUILDING_HEIGHT_M, type NearbyBuilding, type FocusedBuilding, type TerrainSampler } from "./types";
import { allPolygonRings, polygonCentroid } from "./geometry";

const QUERY_RADIUS_PX = 350;

export function queryNearbyBuildings(
  map: any,
  focusedBuilding: NonNullable<FocusedBuilding>,
  terrainSampler?: TerrainSampler | null,
): NearbyBuilding[] {
  if (!map) return [];
  const queryLayer = map.getLayer("building-selection") ? "building-selection" : "3d-buildings";
  if (!map.getLayer(queryLayer)) return [];

  const nearby: NearbyBuilding[] = [];
  try {
    const center = map.project([focusedBuilding.lng, focusedBuilding.lat]);
    const features = map.queryRenderedFeatures(
      [
        [center.x - QUERY_RADIUS_PX, center.y - QUERY_RADIUS_PX],
        [center.x + QUERY_RADIUS_PX, center.y + QUERY_RADIUS_PX],
      ],
      { layers: [queryLayer] },
    );

    for (const f of features) {
      const height = Number(f.properties?.render_height ?? f.properties?.height ?? AVG_BUILDING_HEIGHT_M) || AVG_BUILDING_HEIGHT_M;
      for (const rings of allPolygonRings(f.geometry)) {
        const c = polygonCentroid(rings);
        if (!c) continue;
        const groundElevation = terrainSampler ? (terrainSampler(c[0], c[1]) ?? 0) : 0;
        nearby.push({ footprint: rings, height, groundElevation });
      }
    }
  } catch (e) {
    console.warn("Failed to query nearby buildings:", e);
  }
  return nearby;
}

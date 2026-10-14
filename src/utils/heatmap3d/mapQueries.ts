import { type NearbyBuilding, type FocusedBuilding, type TerrainSampler } from "./types";
import { allPolygonRings, polygonCentroid } from "./geometry";
import { partHeights } from "./buildingProps";
import { FILLER_SOURCE } from "./fillers";

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

    const pushFootprints = (geometry: any, height: number) => {
      for (const rings of allPolygonRings(geometry)) {
        const c = polygonCentroid(rings);
        if (!c) continue;
        const groundElevation = terrainSampler ? (terrainSampler(c[0], c[1]) ?? 0) : 0;
        nearby.push({ footprint: rings, height, groundElevation });
      }
    };

    for (const f of features) {
      pushFootprints(f.geometry, partHeights(f.properties).height);
    }

    if (map.getSource(FILLER_SOURCE)) {
      for (const f of map.querySourceFeatures(FILLER_SOURCE)) {
        const c = polygonCentroid(allPolygonRings(f.geometry)[0] ?? []);
        if (!c) continue;
        const p = map.project(c);
        if (Math.abs(p.x - center.x) > QUERY_RADIUS_PX || Math.abs(p.y - center.y) > QUERY_RADIUS_PX) continue;
        pushFootprints(f.geometry, Number(f.properties?.top) || 0);
      }
    }
  } catch (e) {
    console.warn("Failed to query nearby buildings:", e);
  }
  return nearby;
}

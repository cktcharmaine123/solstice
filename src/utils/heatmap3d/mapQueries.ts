import {
  METERS_PER_DEG,
  AVG_BUILDING_HEIGHT_M,
  type NearbyBuilding,
  type FocusedBuilding,
  type TerrainSampler,
} from "./types";
import { buildingCentroid, allPolygonRings, polygonCentroid } from "./geometry";

export function queryNearbyBuildings(
  map: any,
  focusedBuilding: NonNullable<FocusedBuilding>,
  terrainSampler?: TerrainSampler | null,
): NearbyBuilding[] {
  const queryLayer = map.getLayer("building-selection") ? "building-selection" : "3d-buildings";
  if (!map || !map.getLayer(queryLayer)) return [];

  const nearbyBuildings: NearbyBuilding[] = [];
  try {
    const centerPoint = map.project([focusedBuilding.lng, focusedBuilding.lat]);
    const canvas = map.getCanvas();

    if (
      centerPoint.x < -300 || centerPoint.x > canvas.width + 300 ||
      centerPoint.y < -300 || centerPoint.y > canvas.height + 300
    ) {
      return [];
    }

    const features = map.queryRenderedFeatures(
      [
        [centerPoint.x - 300, centerPoint.y - 300],
        [centerPoint.x + 300, centerPoint.y + 300],
      ],
      { layers: [queryLayer] },
    );

    const seen = new Set<string | number>();

    for (const f of features) {
      const rawId = f.id ?? f.properties?.id ?? f.properties?.osm_id;
      const h = Number(f.properties?.render_height ?? f.properties?.height ?? AVG_BUILDING_HEIGHT_M) || AVG_BUILDING_HEIGHT_M;
      const bh = Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0) || 0;

      const allPolys = allPolygonRings(f.geometry);
      for (const rings of allPolys) {
        const cTile = polygonCentroid(rings);
        if (!cTile) continue;

        const dedupeKey = rawId !== undefined
          ? `${rawId}_${cTile[0].toFixed(6)}_${cTile[1].toFixed(6)}`
          : `${cTile[0].toFixed(6)}_${cTile[1].toFixed(6)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let lng = cTile[0];
        let lat = cTile[1];

        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
          const p = map.project([focusedBuilding.lng, focusedBuilding.lat]);
          const unprojected = map.unproject([p.x, p.y]);
          lng = unprojected.lng;
          lat = unprojected.lat;
        }

        const latRad = (focusedBuilding.lat * Math.PI) / 180;
        const distM = Math.sqrt(
          Math.pow((lng - focusedBuilding.lng) * METERS_PER_DEG * Math.cos(latRad), 2) +
          Math.pow((lat - focusedBuilding.lat) * METERS_PER_DEG, 2),
        );

        if (distM < 5) continue;

        const groundElevation = terrainSampler ? (terrainSampler(lng, lat) ?? 0) : 0;

        nearbyBuildings.push({ lat, lng, height: h, baseHeight: bh, groundElevation });
      }
    }
  } catch (e) {
    console.warn("Failed to query nearby buildings:", e);
  }
  return nearbyBuildings;
}

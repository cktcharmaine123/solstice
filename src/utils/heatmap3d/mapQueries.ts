import {
  METERS_PER_DEG,
  AVG_BUILDING_HEIGHT_M,
  type NearbyBuilding,
  type FocusedBuilding,
} from "./types";
import { buildingCentroid } from "./geometry";

export function queryNearbyBuildings(
  map: any,
  focusedBuilding: NonNullable<FocusedBuilding>,
): NearbyBuilding[] {
  if (!map || !map.getLayer("3d-buildings")) return [];

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
      { layers: ["3d-buildings"] },
    );

    const seen = new Set<string | number>();

    for (const f of features) {
      const rawId = f.id ?? f.properties?.id ?? f.properties?.osm_id;
      const cTile = buildingCentroid(f.geometry);
      if (!cTile) continue;

      const dedupeKey = rawId !== undefined ? rawId : `${cTile[0].toFixed(0)}_${cTile[1].toFixed(0)}`;
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

      const h = Number(f.properties?.render_height ?? f.properties?.height ?? AVG_BUILDING_HEIGHT_M) || AVG_BUILDING_HEIGHT_M;
      const bh = Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0) || 0;

      const latRad = (focusedBuilding.lat * Math.PI) / 180;
      const distM = Math.sqrt(
        Math.pow((lng - focusedBuilding.lng) * METERS_PER_DEG * Math.cos(latRad), 2) +
        Math.pow((lat - focusedBuilding.lat) * METERS_PER_DEG, 2),
      );

      if (distM < 5) continue;

      nearbyBuildings.push({ lat, lng, height: h, baseHeight: bh });
    }
  } catch (e) {
    console.warn("Failed to query nearby buildings:", e);
  }
  return nearbyBuildings;
}
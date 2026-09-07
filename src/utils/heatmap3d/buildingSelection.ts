import { METERS_PER_DEG } from "./types";
import { polygonRings, pointInGeometry, buildingCentroid, findHitPolygon, polygonCentroid } from "./geometry";

export type SelectedBuilding = {
  feature: any;
  geometry: any;
};

export function deduplicateFeatures(
  features: any[],
  tapLng?: number,
  tapLat?: number,
  maxSelectDistanceMeters: number = 100
): SelectedBuilding | null {
  if (!features || features.length === 0) return null;

  const candidates = features.map((f) => {
    const props = f.properties || {};
    const height = Number(props.render_height ?? props.height ?? 0);
    const minHeight = Number(props.render_min_height ?? props.min_height ?? 0);

    let containsTap = false;
    let hitRings: number[][][] | null = null;

    if (tapLng !== undefined && tapLat !== undefined && f.geometry) {
      hitRings = findHitPolygon(tapLng, tapLat, f.geometry);
      containsTap = hitRings !== null;
    }

    return {
      feature: f,
      height,
      minHeight,
      span: height - minHeight,
      containsTap,
      hitRings,
    };
  });

  const containing = candidates.filter((c) => c.containsTap);
  const pool = containing.length > 0 ? containing : candidates;

  pool.sort((a, b) => {
    if (Math.abs(b.minHeight - a.minHeight) > 1) {
      return b.minHeight - a.minHeight;
    }
    return b.height - a.height;
  });

  const winner = pool[0];

  let geometry: any;
  if (winner.hitRings) {
    geometry = { type: "Polygon", coordinates: winner.hitRings };
  } else if (tapLng !== undefined && tapLat !== undefined && winner.feature.geometry?.type === "MultiPolygon") {
    const rings = findHitPolygon(tapLng, tapLat, winner.feature.geometry);
    geometry = rings ? { type: "Polygon", coordinates: rings } : winner.feature.geometry;
  } else {
    geometry = winner.feature.geometry;
  }

  return { feature: winner.feature, geometry };
}

export const selectBuildingFromPoint = deduplicateFeatures;

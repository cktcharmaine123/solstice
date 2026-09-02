import { METERS_PER_DEG } from "./types";
import { polygonRings, pointInGeometry, buildingCentroid } from "./geometry";

export function deduplicateFeatures(
  features: any[],
  tapLng?: number,
  tapLat?: number,
  maxSelectDistanceMeters: number = 100
): any | null {
  if (!features || features.length === 0) return null;

  // 1. Process features and extract elevation/height metrics
  const candidates = features.map((f) => {
    const props = f.properties || {};
    const height = Number(props.render_height ?? props.height ?? 0);
    const minHeight = Number(props.render_min_height ?? props.min_height ?? 0);

    let containsTap = false;
    if (tapLng !== undefined && tapLat !== undefined && f.geometry) {
      containsTap = pointInGeometry(tapLng, tapLat, f.geometry);
    }

    return {
      feature: f,
      height,
      minHeight,
      span: height - minHeight,
      containsTap,
    };
  });

  // 2. Filter by click containment if available, otherwise consider all candidates
  const containing = candidates.filter((c) => c.containsTap);
  const pool = containing.length > 0 ? containing : candidates;

  // 3. Sort pool: Prioritize elevated towers sitting on top of podiums first, then tallest height
  pool.sort((a, b) => {
    if (Math.abs(b.minHeight - a.minHeight) > 1) {
      return b.minHeight - a.minHeight;
    }
    return b.height - a.height;
  });

  return pool[0].feature;
}

// Export alias so existing imports don't break
export const selectBuildingFromPoint = deduplicateFeatures;
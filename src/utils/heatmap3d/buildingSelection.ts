import { METERS_PER_DEG } from "./types";
import { polygonRings, pointInGeometry, buildingCentroid } from "./geometry";

export function deduplicateFeatures(
  features: any[],
  tapLng?: number,
  tapLat?: number
): any | null {
  if (!features || features.length === 0) return null;

  // 1. Filter out zero-height terrain/landuse geometry
  const validBuildings = features.filter((f) => {
    const h = Number(f.properties?.render_height ?? f.properties?.height ?? 0);
    return h > 0;
  });

  if (validBuildings.length === 0) return null;

  // 2. Map metrics
  const candidates = validBuildings.map((f) => {
    const props = f.properties || {};
    const height = Number(props.render_height ?? props.height ?? 0);
    const minHeight = Number(props.render_min_height ?? props.min_height ?? 0);

    return {
      feature: f,
      height,
      minHeight,
    };
  });

  // 3. Sort: Prioritize elevated structures sitting on podiums, then total height
  candidates.sort((a, b) => {
    if (Math.abs(b.minHeight - a.minHeight) > 1) {
      return b.minHeight - a.minHeight;
    }
    return b.height - a.height;
  });

  return candidates[0].feature;
}

export const selectBuildingFromPoint = deduplicateFeatures;
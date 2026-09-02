export {
  METERS_PER_DEG,
  AVG_BUILDING_HEIGHT_M,
  type SurfacePatch,
  type NearbyBuilding,
  type HeatmapResult,
  type FocusedBuilding,
} from "./types";

export {
  polygonRings,
  buildingCentroid,
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  offsetPoint,
} from "./geometry";

export { sunlightColor } from "./color";

export { calculate3DHeatmap } from "./calculation";

export { deduplicateFeatures } from "./buildingSelection";

export { queryNearbyBuildings } from "./mapQueries";

export { renderHeatmapLayers, setHoverHighlight, removeHoverHighlight } from "./mapLayers";

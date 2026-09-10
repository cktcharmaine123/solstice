export {
  METERS_PER_DEG,
  AVG_BUILDING_HEIGHT_M,
  type SurfacePatch,
  type NearbyBuilding,
  type HeatmapResult,
  type FocusedBuilding,
  type TerrainSampler,
} from "./types";

export {
  polygonRings,
  allPolygonRings,
  buildingCentroid,
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  findHitPolygon,
  polygonCentroid,
  offsetPoint,
} from "./geometry";

export { sunlightColor } from "./color";

export { calculate3DHeatmap } from "./calculation";

export { deduplicateFeatures, type SelectedBuilding } from "./buildingSelection";

export { queryNearbyBuildings } from "./mapQueries";

export { renderHeatmapLayers, setHoverHighlight, removeHoverHighlight } from "./mapLayers";

export {
  createTerrainSampler,
  preloadTerrainTiles,
  isTerrainReady,
  clearTerrainCache,
} from "./terrain";

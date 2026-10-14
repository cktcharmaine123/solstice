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
  createLocalFrame,
  openRing,
  ringArea,
  ringCentroid,
  type LocalFrame,
  type Pt,
  polygonRings,
  allPolygonRings,
  buildingCentroid,
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  findHitPolygon,
  polygonCentroid,
} from "./geometry";

export { sunlightColor, sunlightBandIndex, SUNLIGHT_BANDS, type SunlightBand } from "./color";

export { calculate3DHeatmap } from "./calculation";

export { deduplicateFeatures, collectBuildingParts, type SelectedBuilding } from "./buildingSelection";

export { partHeights, displayBase, isRenderablePart, BUILDING_HEIGHT_EXPR, DISPLAY_BASE_EXPR, RENDERABLE_BUILDING_FILTER } from "./buildingProps";

export { FILLER_LAYER, addBuildingFillerLayer, computeBuildingFillers, watchBuildingFillers } from "./fillers";

export { queryNearbyBuildings } from "./mapQueries";

export { renderHeatmapLayers, setHoverHighlight, removeHoverHighlight } from "./mapLayers";

export {
  createTerrainSampler,
  preloadTerrainTiles,
  preloadTerrainBox,
  DETAILED_TERRAIN_ZOOM,
  isTerrainReady,
  clearTerrainCache,
} from "./terrain";

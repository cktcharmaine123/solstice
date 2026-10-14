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

export { partHeights, displayBase, isRenderablePart, RENDERABLE_BUILDING_FILTER } from "./buildingProps";

export { computeBuildingFillers } from "./fillers";

export { cleanGroundHeights, cleanupMargin } from "./groundCleanup";

export { BASE_EMBED_M, MIN_VISIBLE_SHARE, prepareTile, resolveGrounds, seatPiece, type PreparedTile } from "./buildingSeating";

export { createLiveBuildings, LIVE_BUILDING_LAYER, type LiveBuildings } from "./liveBuildings";

export { renderHeatmapLayers, setHoverHighlight, removeHoverHighlight } from "./mapLayers";

export {
  createTerrainSampler,
  createCleanTerrainSampler,
  preloadTerrainBox,
  preloadCleanTerrainBox,
  registerCleanTerrainProtocol,
  CLEAN_TERRAIN_PROTOCOL,
  LIVE_TERRAIN_ZOOM,
  DETAILED_TERRAIN_ZOOM,
} from "./terrain";

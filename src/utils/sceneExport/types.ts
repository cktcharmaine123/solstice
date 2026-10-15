import type { Pt } from "../heatmap3d/geometry";
import type { Pt3 } from "../vectorExport/dxfWriter";
import type { RoadClass } from "../vectorExport/types";

export type { Pt, Pt3 };

export type SceneFace = {
  kind: "roof" | "wall" | "base";
  pts: Pt3[];
  /** Outward horizontal direction, walls only. */
  normal?: Pt;
};

export type HeatmapFace = SceneFace & { band: number };

/** Ground heights on a regular grid, row by row from the south-west corner. */
export type TerrainGrid = {
  x0: number;
  y0: number;
  step: number;
  cols: number;
  rows: number;
  heights: Float32Array;
};

export type ContourLevel = { level: number; segments: [Pt3, Pt3][] };

export type DrapedRoad = { cls: RoadClass; widthM: number; line: Pt3[] };

/**
 * Everything in a 3D export, in metres east (x) and north (y) of the origin,
 * with z the height above sea level (all zero when ground heights are unavailable).
 */
export type Scene3D = {
  title: string;
  dateLabel: string;
  halfExtentM: number;
  originElevation: number;
  hasTerrain: boolean;
  hasMap: boolean;
  /** Buildings come from the Hong Kong Lands Department instead of the street map. */
  hkBuildings: boolean;
  terrain: TerrainGrid;
  contours: ContourLevel[];
  contourInterval: number;
  parks: Pt3[][][];
  water: Pt3[][][];
  waterways: Pt3[][];
  roads: DrapedRoad[];
  railways: Pt3[][];
  buildings: SceneFace[][];
  selected: SceneFace[];
  heatmap: HeatmapFace[];
};

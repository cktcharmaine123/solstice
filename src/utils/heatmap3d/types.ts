export const METERS_PER_DEG = 111320;
export const AVG_BUILDING_HEIGHT_M = 15;

export type TerrainSampler = (lng: number, lat: number) => number | null;

export type SurfacePatch = {
  id: string;
  type: "roof" | "wall";
  wallDir?: "north" | "south" | "east" | "west";
  geometry: any;
  baseHeight: number;
  topHeight: number;
  hours: number;
  color: string;
};

export type NearbyBuilding = {
  lat: number;
  lng: number;
  height: number;
  baseHeight: number;
  groundElevation: number;
};

export type HeatmapResult = {
  patches: SurfacePatch[];
  avgHours: number;
};

export type FocusedBuilding = {
  id: string | number;
  lat: number;
  lng: number;
  height: number;
  baseHeight: number;
  groundElevation: number;
  geometry: any;
} | null;

export const METERS_PER_DEG = 111320;
export const AVG_BUILDING_HEIGHT_M = 15;

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
  geometry: any;
} | null;

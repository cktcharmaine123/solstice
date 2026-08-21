export const METERS_PER_DEG = 111320;
export const AVG_BUILDING_HEIGHT_M = 15;

export type WallDirection = "north" | "south" | "east" | "west";

export type SurfacePatch = {
  id: string;
  type: "roof" | "wall";
  wallDir?: WallDirection;
  geometry: any; // GeoJSON Polygon
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

export type SunStep = {
  altRad: number;
  azRad: number;
  tanAlt: number;
  sunDirX: number;
  sunDirY: number;
};

export type RoofPatch = {
  geometry: any;
  center: [number, number];
};

export type WallSegment = {
  wallDir: WallDirection;
  centerLng: number;
  centerLat: number;
  segment: [number, number][];
};

import { AVG_BUILDING_HEIGHT_M } from "./types";

const MIN_PART_THICKNESS_M = 0.5;

export function partHeights(props: any): { height: number; base: number } {
  const p = props || {};
  const height = Number(p.render_height ?? p.height ?? AVG_BUILDING_HEIGHT_M);
  const base = Number(p.render_min_height ?? p.min_height ?? 0);
  return {
    height: Number.isFinite(height) && height > 0 ? height : AVG_BUILDING_HEIGHT_M,
    base: Number.isFinite(base) && base > 0 ? base : 0,
  };
}

export const BUILDING_HEIGHT_EXPR = ["coalesce", ["get", "render_height"], ["get", "height"], AVG_BUILDING_HEIGHT_M];
export const BUILDING_BASE_EXPR = ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0];

/** Hides pieces with no real thickness (top at or below bottom), which render as lone floating slabs. */
export const RENDERABLE_BUILDING_FILTER = [
  ">=",
  ["-", ["to-number", BUILDING_HEIGHT_EXPR], ["to-number", BUILDING_BASE_EXPR]],
  MIN_PART_THICKNESS_M,
];

import { AVG_BUILDING_HEIGHT_M } from "./types";

const MIN_PART_THICKNESS_M = 0.5;
// Each piece is seated on the terrain under its own centre, so stacked pieces on a slope drift apart vertically.
export const RAISED_PART_OVERLAP_M = 4;

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

/** Extends raised pieces slightly downward so they meet the piece below instead of hovering over a seam. */
export const DISPLAY_BASE_EXPR = [
  "case",
  [">", ["to-number", BUILDING_BASE_EXPR], 0],
  ["max", 0.1, ["-", ["to-number", BUILDING_BASE_EXPR], RAISED_PART_OVERLAP_M]],
  0,
];

/**
 * Hides outlines flagged hide_3d (the whole-complex shell drawn separately from its real pieces)
 * and pieces with no real thickness, which render as lone floating slabs.
 */
export const RENDERABLE_BUILDING_FILTER = [
  "all",
  ["!=", ["get", "hide_3d"], true],
  [
    ">=",
    ["-", ["to-number", BUILDING_HEIGHT_EXPR], ["to-number", BUILDING_BASE_EXPR]],
    MIN_PART_THICKNESS_M,
  ],
];

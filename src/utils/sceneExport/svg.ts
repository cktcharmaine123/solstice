import { SUNLIGHT_BANDS } from "../heatmap3d";
import { esc, layerId } from "../vectorExport/svg";
import { gridPoint, heightRange } from "./ground";
import type { HeatmapFace, Pt, Pt3, Scene3D, SceneFace } from "./types";

const DRAW_W = 1100;
const MARGIN = 40;
const HEADER = 118;
const FONT = "Inter, Helvetica, Arial, sans-serif";
const SKIRT_M = 6;

/** True isometric camera from the south-west: 45 degrees round, 35.26 degrees down. */
const SIN_E = 1 / Math.sqrt(3);
const COS_E = Math.sqrt(2 / 3);
const LIGHT: Pt3 = [-0.5, 0.5, Math.SQRT1_2];

const STYLE = {
  ground: "#ebe8df",
  skirt: "#d6d1c3",
  contour: "#a89a80",
  park: "#d9e2d2",
  water: "#c3d1da",
  waterway: "#b3c3cc",
  roadCasing: "#cfcac0",
  road: "#ffffff",
  rail: "#9a9a9a",
  label: "#6b6b6b",
  building: "#dedede",
  buildingStroke: "#a9a9a9",
  selected: "#9fb0bf",
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v * k))).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function wallLight(normal: Pt | undefined): number {
  if (!normal) return 1;
  return (normal[0] * LIGHT[0] + normal[1] * LIGHT[1]) / Math.hypot(LIGHT[0], LIGHT[1]);
}

function facesCamera(f: SceneFace): boolean {
  if (f.kind === "base") return false;
  if (f.kind === "roof") return true;
  return !!f.normal && f.normal[0] + f.normal[1] < 0;
}

/** Horizontal distance along the view direction; larger is farther from the camera. */
function faceDepth(f: SceneFace): number {
  let d = 0;
  let z = 0;
  for (const [x, y, pz] of f.pts) {
    d += x + y;
    z += pz;
  }
  return (d / f.pts.length) * Math.SQRT1_2 - (z / f.pts.length) * 1e-4;
}

function sortBackToFront<T extends SceneFace>(faces: T[]): T[] {
  return faces
    .filter(facesCamera)
    .map((f) => ({ f, d: faceDepth(f) }))
    .sort((a, b) => b.d - a.d)
    .map((e) => e.f);
}

export function buildSceneSvg(scene: Scene3D): string {
  const z0 = scene.originElevation;
  const grid = scene.terrain;
  const floor = heightRange(grid)[0] - SKIRT_M;
  const proj = ([x, y, z]: Pt3): Pt => [(x - y) * Math.SQRT1_2, SIN_E * (x + y) * Math.SQRT1_2 + COS_E * (z - z0)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const extend = (p: Pt3) => {
    const [X, Y] = proj(p);
    minX = Math.min(minX, X);
    maxX = Math.max(maxX, X);
    minY = Math.min(minY, Y);
    maxY = Math.max(maxY, Y);
  };
  for (let r = 0; r <= grid.rows; r += grid.rows) {
    for (let c = 0; c <= grid.cols; c += grid.cols) {
      const [x, y] = gridPoint(grid, c, r);
      extend([x, y, floor]);
    }
  }
  for (let i = 0; i < grid.heights.length; i++) extend(gridPoint(grid, i % (grid.cols + 1), Math.floor(i / (grid.cols + 1))));
  for (const f of [...scene.buildings.flat(), ...scene.selected, ...scene.heatmap]) for (const p of f.pts) extend(p);

  const s = DRAW_W / (maxX - minX);
  const drawH = (maxY - minY) * s;
  const width = DRAW_W + MARGIN * 2;
  const legendTop = HEADER + drawH + 48;
  const legendRows = scene.heatmap.length > 0 ? SUNLIGHT_BANDS.length : 0;
  const height = legendTop + legendRows * 26 + 70;

  const toPx = (p: Pt3): Pt => {
    const [X, Y] = proj(p);
    return [MARGIN + (X - minX) * s, HEADER + (maxY - Y) * s];
  };
  const fmt = ([x, y]: Pt) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const ring = (pts: Pt3[]) => `M${pts.map((p) => fmt(toPx(p))).join("L")}Z`;
  const line = (pts: Pt3[]) => (pts.length < 2 ? "" : `M${pts.map((p) => fmt(toPx(p))).join("L")}`);
  const layer = (name: string, body: string) =>
    body ? `<g id="${layerId(name)}" inkscape:groupmode="layer" inkscape:label="${esc(name)}">${body}</g>\n` : "";
  const facePath = (pts: Pt3[], fill: string, stroke = fill, sw = 0.5) =>
    `<path d="${ring(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${height.toFixed(0)}" viewBox="0 0 ${width} ${height.toFixed(0)}" font-family="${FONT}">
<title>${esc(scene.title)} - 3D sunlight view</title>
<rect width="${width}" height="${height.toFixed(0)}" fill="#ffffff"/>
`);

  const size = (2 * scene.halfExtentM).toFixed(0);
  parts.push(
    layer(
      "Title",
      `<text x="${MARGIN}" y="56" font-size="26" font-weight="600" fill="#2b2b2b">${esc(scene.title)}</text>` +
        `<text x="${MARGIN}" y="84" font-size="14" fill="#7a7a7a">${esc(scene.dateLabel)} - ${size} m x ${size} m area</text>` +
        `<text x="${MARGIN}" y="104" font-size="12" fill="#9a9a9a">Isometric view from the south-west. Not a plan: distances are foreshortened equally along every axis, so measure in the DXF model instead.</text>`,
    ),
  );

  const terrain: string[] = [];
  const g = (c: number, r: number) => gridPoint(grid, c, r);
  const south: Pt3[] = [];
  const west: Pt3[] = [];
  for (let c = 0; c <= grid.cols; c++) south.push(g(c, 0));
  for (let r = 0; r <= grid.rows; r++) west.push(g(0, r));
  const skirt = (edge: Pt3[]) => [...edge, ...edge.slice().reverse().map(([x, y]) => [x, y, floor] as Pt3)];
  terrain.push(facePath(skirt(south), shade(STYLE.skirt, 0.86), "#b9b3a3", 0.8), facePath(skirt(west), STYLE.skirt, "#b9b3a3", 0.8));
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const a = g(c, r), b = g(c + 1, r), cc = g(c + 1, r + 1), d = g(c, r + 1);
      const ux = b[0] - a[0], uz = b[2] - a[2], vy = d[1] - a[1], vz = d[2] - a[2];
      const n: Pt3 = [-uz * vy, -ux * vz, ux * vy];
      const len = Math.hypot(n[0], n[1], n[2]);
      const lit = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len;
      terrain.push(facePath([a, b, cc, d], shade(STYLE.ground, Math.min(1.12, Math.max(0.6, 1 + 0.9 * (lit - Math.SQRT1_2))))));
    }
  }
  parts.push(layer("Ground", terrain.join("")));
  parts.push(
    layer(
      `Contours (${scene.contourInterval} m)`,
      scene.contours
        .map((lvl) => `<path d="${lvl.segments.map(([a, b]) => `M${fmt(toPx(a))}L${fmt(toPx(b))}`).join("")}" fill="none" stroke="${STYLE.contour}" stroke-width="${lvl.level % (scene.contourInterval * 5) === 0 ? 1 : 0.5}" stroke-opacity="0.7"/>`)
        .join(""),
    ),
  );

  const polys = (list: Pt3[][][], fill: string) =>
    list.map((rings) => `<path d="${rings.map(ring).join("")}" fill="${fill}" fill-rule="evenodd"/>`).join("");
  parts.push(layer("Parks", polys(scene.parks, STYLE.park)));
  parts.push(layer("Water", polys(scene.water, STYLE.water)));
  parts.push(
    layer("Waterways", scene.waterways.map((l) => `<path d="${line(l)}" fill="none" stroke="${STYLE.waterway}" stroke-width="${(2.5 * s).toFixed(2)}" stroke-linecap="round"/>`).join("")),
  );
  const roadStroke = (widthM: number, color: string) => (l: Pt3[]) =>
    `<path d="${line(l)}" fill="none" stroke="${color}" stroke-width="${(widthM * s * COS_E).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  parts.push(
    layer("Roads", [
      ...scene.roads.map((r) => roadStroke(r.widthM + 1.5, STYLE.roadCasing)(r.line)),
      ...scene.roads.map((r) => roadStroke(r.widthM, STYLE.road)(r.line)),
    ].join("")),
  );
  parts.push(
    layer("Railways", scene.railways.map((l) => `<path d="${line(l)}" fill="none" stroke="${STYLE.rail}" stroke-width="1.2" stroke-dasharray="6 3"/>`).join("")),
  );
  const labelSize = Math.max(8, Math.min(12, 2.8 * s));
  parts.push(
    layer(
      "Street names",
      scene.labels
        .map((l) => {
          const t = (l.angleDeg * Math.PI) / 180;
          const [dx, dy] = [Math.cos(t), Math.sin(t)];
          let angle = (Math.atan2(-SIN_E * (dx + dy) * Math.SQRT1_2, (dx - dy) * Math.SQRT1_2) * 180) / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle <= -90) angle += 180;
          const [x, y] = toPx(l.at).map((v) => v.toFixed(1));
          return `<text x="${x}" y="${y}" transform="rotate(${angle.toFixed(1)} ${x} ${y})" text-anchor="middle" dominant-baseline="central" font-size="${labelSize.toFixed(1)}" fill="${STYLE.label}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${esc(l.text)}</text>`;
        })
        .join(""),
    ),
  );

  const buildingFace = (f: SceneFace, base: string) => {
    const k = f.kind === "roof" ? 1 : 0.8 + 0.18 * wallLight(f.normal);
    return facePath(f.pts, shade(base, k), STYLE.buildingStroke, 0.4);
  };
  const selectedDepth = scene.selected.length > 0 ? faceDepth({ kind: "roof", pts: [[0, 0, 0]] }) : -Infinity;
  const behind: SceneFace[] = [];
  const front: SceneFace[] = [];
  for (const b of scene.buildings) {
    const roofish = b.find((f) => f.kind === "roof") ?? b[0];
    (roofish && faceDepth(roofish) > selectedDepth ? behind : front).push(...b);
  }
  parts.push(layer("Buildings behind", sortBackToFront(behind).map((f) => buildingFace(f, STYLE.building)).join("")));
  parts.push(layer("Selected building", sortBackToFront(scene.selected).map((f) => buildingFace(f, STYLE.selected)).join("")));

  const heatSorted = sortBackToFront<HeatmapFace>(scene.heatmap);
  SUNLIGHT_BANDS.forEach((band, i) => {
    const body = heatSorted
      .filter((f) => f.band === i)
      .map((f) => {
        const fill = shade(band.color, f.kind === "roof" ? 1 : 0.9 + 0.1 * wallLight(f.normal));
        return facePath(f.pts, fill, fill, 0.35);
      })
      .join("");
    parts.push(layer(`Heatmap - ${band.label}`, body));
  });
  parts.push(layer("Buildings in front", sortBackToFront(front).map((f) => buildingFace(f, STYLE.building)).join("")));

  const nx = MARGIN + DRAW_W - 50;
  const ny = HEADER + 40;
  const north = { x: -Math.SQRT1_2, y: -SIN_E * Math.SQRT1_2 };
  const nl = Math.hypot(north.x, north.y);
  const [ux, uy] = [north.x / nl, north.y / nl];
  const tip = [nx + ux * 22, ny + uy * 22];
  const tail = [nx - ux * 14, ny - uy * 14];
  const side = (k: number) => `${(tail[0] + -uy * k * 7).toFixed(1)},${(tail[1] + ux * k * 7).toFixed(1)}`;
  parts.push(
    layer(
      "North arrow",
      `<circle cx="${nx}" cy="${ny}" r="30" fill="#ffffff" fill-opacity="0.92" stroke="#d0d0d0"/>` +
        `<path d="M${tip[0].toFixed(1)},${tip[1].toFixed(1)}L${side(1)}L${nx},${ny}L${side(-1)}Z" fill="#ef4444"/>` +
        `<text x="${(nx + ux * 40).toFixed(1)}" y="${(ny + uy * 40 + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#7a4a4a">N</text>`,
    ),
  );

  const legend: string[] = [];
  if (legendRows > 0) {
    legend.push(`<text x="${MARGIN}" y="${legendTop - 14}" font-size="14" font-weight="600" fill="#333333">Hours of direct sunlight</text>`);
    SUNLIGHT_BANDS.forEach((band, i) => {
      const y = legendTop + i * 26;
      legend.push(
        `<rect x="${MARGIN}" y="${y}" width="28" height="16" rx="3" fill="${band.color}"/>` +
          `<text x="${MARGIN + 40}" y="${y + 13}" font-size="14" fill="#333333">${esc(band.label)}</text>`,
      );
    });
  } else {
    legend.push(`<text x="${MARGIN}" y="${legendTop}" font-size="13" fill="#7a7a7a">No sunlight heatmap: no building was selected.</text>`);
  }
  const credits = [
    scene.hasMap ? "Map data (c) OpenStreetMap contributors, OpenMapTiles" : "Map data unavailable",
    scene.hasTerrain ? "Terrain: AWS Terrain Tiles" : "Ground heights unavailable - shown flat",
  ].join(" - ");
  legend.push(`<text x="${MARGIN + DRAW_W}" y="${height - 30}" text-anchor="end" font-size="11" fill="#9a9a9a">${esc(credits)}</text>`);
  parts.push(layer("Legend", legend.join("")));

  parts.push("</svg>\n");
  return parts.join("");
}

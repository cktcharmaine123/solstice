import earcut from "earcut";
import { SUNLIGHT_BANDS } from "../heatmap3d";
import { gridHeight, gridPoint } from "./ground";
import type { Pt3, Scene3D, SceneFace } from "./types";

export const OBJ_FILE = "sunlight-model.obj";
export const MTL_FILE = "sunlight-model.mtl";

const MAP_LIFT_M = 0.2;
const MAX_EDGE_M = 6;

type Material = { name: string; color: string };

const MATERIALS = {
  terrain: { name: "terrain", color: "#d8d2c2" },
  park: { name: "park", color: "#a9c79a" },
  water: { name: "water", color: "#8fb3cc" },
  building: { name: "building", color: "#c8c8c8" },
  selected: { name: "selected-footing", color: "#8fa3b5" },
} satisfies Record<string, Material>;

const bandMaterial = (key: string): Material => {
  const band = SUNLIGHT_BANDS.find((b) => b.key === key)!;
  return { name: `heatmap-${band.key}`, color: band.color };
};

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(4)).join(" ");
}

function buildMtl(materials: Material[]): string {
  return materials
    .map((m) => `newmtl ${m.name}\nKa 0 0 0\nKd ${rgb(m.color)}\nKs 0 0 0\nNs 1\nd 1\nillum 1\n`)
    .join("\n");
}

function normalOf(pts: Pt3[]): Pt3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1, z1] = pts[i];
    const [x2, y2, z2] = pts[(i + 1) % pts.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  return [nx, ny, nz];
}

/** Puts the corners in counter-clockwise order seen from outside, so renderers light the right side. */
function oriented(f: SceneFace): Pt3[] {
  const [nx, ny, nz] = normalOf(f.pts);
  const want: Pt3 = f.kind === "roof" ? [0, 0, 1] : f.kind === "base" ? [0, 0, -1] : [f.normal?.[0] ?? 0, f.normal?.[1] ?? 0, 0];
  return nx * want[0] + ny * want[1] + nz * want[2] < 0 ? f.pts.slice().reverse() : f.pts;
}

/** Splits a triangle until no edge is longer than MAX_EDGE_M, so draped shapes can follow the ground. */
function subdivide(tri: [number, number][], out: [number, number][][]): void {
  const d = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lens = [d(tri[0], tri[1]), d(tri[1], tri[2]), d(tri[2], tri[0])];
  const longest = lens.indexOf(Math.max(...lens));
  if (lens[longest] <= MAX_EDGE_M) {
    out.push(tri);
    return;
  }
  const a = tri[longest];
  const b = tri[(longest + 1) % 3];
  const c = tri[(longest + 2) % 3];
  const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  subdivide([a, m, c], out);
  subdivide([m, b, c], out);
}

/**
 * Builds a Z-up OBJ model (1 unit = 1 metre, +Y north, origin at the selected building's ground level)
 * with a matching material file, so colours show in rendered views.
 */
export function buildSceneObj(scene: Scene3D): { obj: string; mtl: string } {
  const z0 = scene.originElevation;
  const lines: string[] = [
    `# ${scene.title} - ${scene.dateLabel}`,
    "# 1 unit = 1 metre, +X east, +Y north, +Z up. Origin at the selected building, Z = 0 is its ground level.",
    `mtllib ${MTL_FILE}`,
  ];
  let vertexCount = 0;
  const vertex = ([x, y, z]: Pt3) => {
    lines.push(`v ${x.toFixed(3)} ${y.toFixed(3)} ${(z - z0).toFixed(3)}`);
    return ++vertexCount;
  };
  const face = (pts: Pt3[]) => lines.push(`f ${pts.map(vertex).join(" ")}`);
  const group = (name: string, material: Material) => lines.push(`g ${name}`, `usemtl ${material.name}`);

  const g = scene.terrain;
  group("TERRAIN", MATERIALS.terrain);
  const first = vertexCount + 1;
  for (let r = 0; r <= g.rows; r++) for (let c = 0; c <= g.cols; c++) vertex(gridPoint(g, c, r));
  const idx = (c: number, r: number) => first + r * (g.cols + 1) + c;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      lines.push(`f ${idx(c, r)} ${idx(c + 1, r)} ${idx(c + 1, r + 1)}`, `f ${idx(c, r)} ${idx(c + 1, r + 1)} ${idx(c, r + 1)}`);
    }
  }

  const drapedArea = (polys: Pt3[][][], name: string, material: Material) => {
    if (polys.length === 0) return;
    group(name, material);
    for (const rings of polys) {
      const flat: number[] = [];
      const holes: number[] = [];
      rings.forEach((ring, i) => {
        if (i > 0) holes.push(flat.length / 2);
        for (const [x, y] of ring) flat.push(x, y);
      });
      const tri = earcut(flat, holes);
      for (let i = 0; i < tri.length; i += 3) {
        const pieces: [number, number][][] = [];
        subdivide([tri[i], tri[i + 1], tri[i + 2]].map((k) => [flat[k * 2], flat[k * 2 + 1]] as [number, number]), pieces);
        for (const p of pieces) {
          const pts = p.map(([x, y]) => [x, y, gridHeight(g, x, y) + MAP_LIFT_M] as Pt3);
          face(normalOf(pts)[2] < 0 ? pts.reverse() : pts);
        }
      }
    }
  };
  drapedArea(scene.parks, "MAP-PARKS", MATERIALS.park);
  drapedArea(scene.water, "MAP-WATER", MATERIALS.water);

  if (scene.buildings.length > 0) {
    group("BUILDINGS-SURROUNDING", MATERIALS.building);
    for (const building of scene.buildings) for (const f of building) face(oriented(f));
  }
  if (scene.selected.length > 0) {
    group("BUILDING-SELECTED", MATERIALS.selected);
    for (const f of scene.selected) face(oriented(f));
  }
  SUNLIGHT_BANDS.forEach((band, i) => {
    const faces = scene.heatmap.filter((f) => f.band === i);
    if (faces.length === 0) return;
    group(`HEATMAP-${band.key.toUpperCase()}`, bandMaterial(band.key));
    for (const f of faces) face(oriented(f));
  });

  const materials = [...Object.values(MATERIALS), ...SUNLIGHT_BANDS.map((b) => bandMaterial(b.key))];
  return { obj: lines.join("\n") + "\n", mtl: buildMtl(materials) };
}

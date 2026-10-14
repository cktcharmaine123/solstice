import { SUNLIGHT_BANDS } from "../heatmap3d";
import { DxfWriter, layerName, nearestAci, type DxfLayer } from "../vectorExport/dxfWriter";
import { gridPoint, heightRange } from "./ground";
import type { Pt3, Scene3D } from "./types";

const bandLayer = (key: string) => layerName(`HEATMAP-${key}`);

/**
 * Builds an R12 ASCII DXF 3D model: 1 unit = 1 metre, +Y north, +Z up,
 * origin at the selected building with Z = 0 at its ground level. Opens in a south-west isometric view.
 */
export function buildSceneDxf(scene: Scene3D): string {
  const h = scene.halfExtentM;
  const z0 = scene.originElevation;
  const at = ([x, y, z]: Pt3): Pt3 => [x, y, z - z0];

  const layers: DxfLayer[] = [
    { name: "TERRAIN", color: nearestAci("#c9c4b0"), linetype: "CONTINUOUS" },
    { name: "TERRAIN-CONTOURS", color: nearestAci("#a08c6e"), linetype: "CONTINUOUS" },
    { name: "MAP-PARKS", color: 92, linetype: "CONTINUOUS" },
    { name: "MAP-WATER", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-WATERWAYS", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MAJOR", color: 252, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MINOR", color: 253, linetype: "CONTINUOUS" },
    { name: "MAP-PATHS", color: 254, linetype: "CONTINUOUS" },
    { name: "MAP-RAIL", color: 251, linetype: "DASHED" },
    { name: "BUILDINGS-SURROUNDING", color: 9, linetype: "CONTINUOUS" },
    { name: "BUILDING-SELECTED", color: nearestAci("#8fa3b5"), linetype: "CONTINUOUS" },
    ...SUNLIGHT_BANDS.map((b) => ({ name: bandLayer(b.key), color: nearestAci(b.color), linetype: "CONTINUOUS" as const })),
    { name: "NORTH-ARROW", color: 1, linetype: "CONTINUOUS" },
    { name: "TITLE", color: 250, linetype: "CONTINUOUS" },
  ];

  const [minG, maxG] = heightRange(scene.terrain);
  let maxZ = maxG;
  for (const f of [...scene.buildings.flat(), ...scene.selected, ...scene.heatmap]) {
    for (const p of f.pts) if (p[2] > maxZ) maxZ = p[2];
  }
  const floor = minG - z0;

  const w = new DxfWriter();
  w.preamble({
    extMin: [-h, -h - 50, floor],
    extMax: [h, h, maxZ - z0],
    layers,
    view: { direction: [-1, -1, 1], target: [0, 0, 0], height: 2.4 * h },
  });

  const g = scene.terrain;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const a = at(gridPoint(g, c, r));
      const b = at(gridPoint(g, c + 1, r));
      const cc = at(gridPoint(g, c + 1, r + 1));
      const d = at(gridPoint(g, c, r + 1));
      w.face("TERRAIN", [a, b, cc]);
      w.face("TERRAIN", [a, cc, d]);
    }
  }
  for (const level of scene.contours) for (const [a, b] of level.segments) w.line("TERRAIN-CONTOURS", at(a), at(b));

  for (const poly of scene.parks) for (const ring of poly) w.polyline3d("MAP-PARKS", ring.map(at), true);
  for (const poly of scene.water) for (const ring of poly) w.polyline3d("MAP-WATER", ring.map(at), true);
  for (const line of scene.waterways) w.polyline3d("MAP-WATERWAYS", line.map(at), false);
  for (const road of scene.roads) {
    const layer = road.cls === "major" ? "MAP-ROADS-MAJOR" : road.cls === "minor" ? "MAP-ROADS-MINOR" : "MAP-PATHS";
    w.polyline3d(layer, road.line.map(at), false);
  }
  for (const line of scene.railways) w.polyline3d("MAP-RAIL", line.map(at), false);

  for (const building of scene.buildings) for (const f of building) w.face("BUILDINGS-SURROUNDING", f.pts.map(at));
  for (const f of scene.selected) w.face("BUILDING-SELECTED", f.pts.map(at));
  for (const f of scene.heatmap) w.face(bandLayer(SUNLIGHT_BANDS[f.band].key), f.pts.map(at));

  const ax = h - 15;
  const ay = h - 25;
  const arrow: Pt3[] = [[ax, ay + 12, floor], [ax - 4, ay, floor], [ax, ay + 3, floor], [ax + 4, ay, floor]];
  w.polyline3d("NORTH-ARROW", arrow, true);
  w.text("NORTH-ARROW", [ax, ay - 4], 4, "N", { center: true, z: floor });

  const notes = [
    `${scene.dateLabel} - 3D model with sunlight heatmap`,
    `1 unit = 1 metre, +Y north, +Z up. Origin at the selected building, Z = 0 is its ground level (${z0.toFixed(1)} m above sea level).`,
    scene.hasTerrain
      ? `Ground from terrain heights with ${scene.contourInterval} m contours.`
      : "Ground heights unavailable - ground shown flat.",
    scene.heatmap.length > 0
      ? `Hours of direct sunlight: ${SUNLIGHT_BANDS.map((b) => `${b.label} (layer ${bandLayer(b.key)})`).join(", ")}`
      : "No heatmap included - no building was selected.",
    scene.hasMap ? "Map data (c) OpenStreetMap contributors, OpenMapTiles. Terrain: Mapzen / AWS Terrain Tiles." : "Map data unavailable - buildings and streets not included.",
  ];
  w.text("TITLE", [-h, -h - 14], 6, scene.title, { z: floor });
  notes.forEach((n, i) => w.text("TITLE", [-h, -h - 22 - i * 5], 2.5, n, { z: floor }));

  return w.finish();
}

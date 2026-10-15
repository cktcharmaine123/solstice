import { DxfWriter, layerName, nearestAci, type DxfLayer } from "./dxfWriter";
import { diagramFrame, latLngToLocal } from "./geometry";
import { HK_BUILDINGS_CREDIT } from "./hkBuildings";
import type { DiagramSpec, MapOutlines } from "./types";

/** Builds an R12 ASCII DXF: 1 drawing unit = 1 metre, north = +Y, site centre at the origin. */
export function buildDiagramDxf(spec: DiagramSpec, map: MapOutlines): string {
  const h = spec.halfExtentM;
  const frame = diagramFrame(spec);
  const local = (p: [number, number]) => latLngToLocal(frame, p);

  const pathLayers = spec.paths.map((p, i) => ({
    name: layerName(i === 0 ? "SUN-PATH-MAIN" : `SUN-PATH-${i}-${/^[\x20-\x7e]+$/.test(p.label) ? p.label : "COMPARISON"}`),
    color: nearestAci(p.color),
    linetype: p.dashed ? ("DASHED" as const) : ("CONTINUOUS" as const),
  }));
  const layers: DxfLayer[] = [
    { name: "MAP-PARKS", color: 92, linetype: "CONTINUOUS" },
    { name: "MAP-WATER", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-WATERWAYS", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-BUILDINGS", color: 8, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MAJOR", color: 252, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MINOR", color: 253, linetype: "CONTINUOUS" },
    { name: "MAP-PATHS", color: 254, linetype: "CONTINUOUS" },
    { name: "MAP-RAIL", color: 251, linetype: "DASHED" },
    ...pathLayers,
    { name: "SUN-AREA", color: 40, linetype: "CONTINUOUS" },
    { name: "SUN-MARKERS", color: 30, linetype: "CONTINUOUS" },
    { name: "SITE-CENTRE", color: nearestAci("#7a4a4a"), linetype: "CONTINUOUS" },
    { name: "NORTH-ARROW", color: 1, linetype: "CONTINUOUS" },
    { name: "FRAME", color: 9, linetype: "CONTINUOUS" },
    { name: "TITLE", color: 250, linetype: "CONTINUOUS" },
  ];

  const w = new DxfWriter();
  w.preamble({ extMin: [-h, -h - 40, 0], extMax: [h, h + 30, 0], layers });

  for (const poly of map.parks) for (const ring of poly) w.polyline("MAP-PARKS", ring, true);
  for (const poly of map.water) for (const ring of poly) w.polyline("MAP-WATER", ring, true);
  for (const line of map.waterways) w.polyline("MAP-WATERWAYS", line, false);
  for (const poly of map.buildings) for (const ring of poly) w.polyline("MAP-BUILDINGS", ring, true);
  for (const road of map.roads) {
    const layer = road.cls === "major" ? "MAP-ROADS-MAJOR" : road.cls === "minor" ? "MAP-ROADS-MINOR" : "MAP-PATHS";
    w.polyline(layer, road.line, false);
  }
  for (const line of map.railways) w.polyline("MAP-RAIL", line, false);

  spec.paths.forEach((p, i) => {
    w.polyline(pathLayers[i].name, p.points.map(local), false);
    if (p.cone.length >= 3) w.polyline("SUN-AREA", p.cone.map(local), true);
    if (p.marker) w.circle("SUN-MARKERS", local(p.marker), 2);
  });

  w.circle("SITE-CENTRE", [0, 0], 1);
  w.polyline("SITE-CENTRE", [[-3, 0], [3, 0]], false);
  w.polyline("SITE-CENTRE", [[0, -3], [0, 3]], false);

  const ax = h - 15;
  const ay = h - 25;
  w.polyline("NORTH-ARROW", [[ax, ay + 12], [ax - 4, ay], [ax, ay + 3], [ax + 4, ay]], true);
  w.text("NORTH-ARROW", [ax, ay - 4], 4, "N", { center: true });

  w.polyline("FRAME", [[-h, -h], [h, -h], [h, h], [-h, h]], true);

  w.text("TITLE", [-h, h + 14], 6, spec.title);
  w.text("TITLE", [-h, h + 6], 3, "Sun path diagram - north up - 1 unit = 1 metre - origin at site centre");
  spec.paths.forEach((p, i) => {
    const label = i === 0 ? p.dateLabel : `${p.label} (${p.dateLabel})`;
    w.text("TITLE", [-h, -h - 8 - i * 5], 3, `${label} - sun at ${p.timeLabel}`);
  });
  w.text("TITLE", [-h, -h - 10 - spec.paths.length * 5], 2, "Map data (c) OpenStreetMap contributors, OpenMapTiles");
  if (map.hkBuildings) w.text("TITLE", [-h, -h - 13 - spec.paths.length * 5], 2, HK_BUILDINGS_CREDIT);

  return w.finish();
}

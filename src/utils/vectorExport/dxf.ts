import { diagramFrame, latLngToLocal } from "./geometry";
import type { DiagramSpec, MapOutlines, Pt } from "./types";

type Layer = { name: string; color: number; linetype: "CONTINUOUS" | "DASHED" };

const VALUE_BY_DIGIT = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];

function aciRgb(index: number): [number, number, number] {
  const fixed: Record<number, [number, number, number]> = {
    1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255],
    7: [0, 0, 0], 8: [128, 128, 128], 9: [192, 192, 192],
    250: [51, 51, 51], 251: [80, 80, 80], 252: [105, 105, 105], 253: [130, 130, 130], 254: [190, 190, 190], 255: [255, 255, 255],
  };
  if (fixed[index]) return fixed[index];
  const hue = (Math.floor(index / 10) - 1) * 15;
  const digit = index % 10;
  const v = VALUE_BY_DIGIT[digit];
  const sat = digit % 2 === 1 ? 0.5 : 1;
  const c = v * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Closest AutoCAD Color Index for a hex colour (true colour needs newer DXF versions). */
export function nearestAci(hex: string): number {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const target = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = 7;
  let bestD = Infinity;
  for (let i = 1; i <= 255; i++) {
    if (i === 7) continue;
    const [r, g, b] = aciRgb(i);
    const d = (r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function layerName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 31);
}

function dxfText(text: string): string {
  return Array.from(text.replace(/[\r\n]+/g, " "))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 63;
      return code > 126 ? `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}` : ch;
    })
    .join("")
    .slice(0, 250);
}

class DxfWriter {
  private lines: string[] = [];

  pair(code: number, value: string | number): void {
    this.lines.push(String(code), typeof value === "number" ? formatNum(value) : value);
  }

  polyline(layer: string, pts: Pt[], closed: boolean, linetype?: string): void {
    if (pts.length < 2) return;
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    if (linetype) this.pair(6, linetype);
    this.pair(66, "1");
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    this.pair(70, closed ? "1" : "0");
    for (const [x, y] of pts) {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.pair(10, x);
      this.pair(20, y);
      this.pair(30, 0);
    }
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }

  circle(layer: string, [x, y]: Pt, r: number): void {
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.pair(10, x);
    this.pair(20, y);
    this.pair(30, 0);
    this.pair(40, r);
  }

  text(layer: string, [x, y]: Pt, height: number, text: string, opts: { rotation?: number; center?: boolean } = {}): void {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.pair(10, x);
    this.pair(20, y);
    this.pair(30, 0);
    this.pair(40, height);
    this.pair(1, dxfText(text));
    if (opts.rotation) this.pair(50, opts.rotation);
    if (opts.center) {
      this.pair(72, "1");
      this.pair(11, x);
      this.pair(21, y);
      this.pair(31, 0);
      this.pair(73, "2");
    }
  }

  toString(): string {
    return `${this.lines.join("\r\n")}\r\n`;
  }
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : n.toFixed(4);
}

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
  const layers: Layer[] = [
    { name: "MAP-PARKS", color: 92, linetype: "CONTINUOUS" },
    { name: "MAP-WATER", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-WATERWAYS", color: 151, linetype: "CONTINUOUS" },
    { name: "MAP-BUILDINGS", color: 8, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MAJOR", color: 252, linetype: "CONTINUOUS" },
    { name: "MAP-ROADS-MINOR", color: 253, linetype: "CONTINUOUS" },
    { name: "MAP-PATHS", color: 254, linetype: "CONTINUOUS" },
    { name: "MAP-RAIL", color: 251, linetype: "DASHED" },
    { name: "MAP-STREET-NAMES", color: 252, linetype: "CONTINUOUS" },
    ...pathLayers,
    { name: "SUN-AREA", color: 40, linetype: "CONTINUOUS" },
    { name: "SUN-MARKERS", color: 30, linetype: "CONTINUOUS" },
    { name: "SITE-CENTRE", color: nearestAci("#7a4a4a"), linetype: "CONTINUOUS" },
    { name: "NORTH-ARROW", color: 1, linetype: "CONTINUOUS" },
    { name: "FRAME", color: 9, linetype: "CONTINUOUS" },
    { name: "TITLE", color: 250, linetype: "CONTINUOUS" },
  ];

  const w = new DxfWriter();
  w.pair(0, "SECTION");
  w.pair(2, "HEADER");
  w.pair(9, "$ACADVER");
  w.pair(1, "AC1009");
  w.pair(9, "$EXTMIN");
  w.pair(10, -h);
  w.pair(20, -h - 40);
  w.pair(9, "$EXTMAX");
  w.pair(10, h);
  w.pair(20, h + 30);
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "TABLES");
  w.pair(0, "TABLE");
  w.pair(2, "LTYPE");
  w.pair(70, "2");
  w.pair(0, "LTYPE");
  w.pair(2, "CONTINUOUS");
  w.pair(70, "0");
  w.pair(3, "Solid line");
  w.pair(72, "65");
  w.pair(73, "0");
  w.pair(40, 0);
  w.pair(0, "LTYPE");
  w.pair(2, "DASHED");
  w.pair(70, "0");
  w.pair(3, "Dashed __ __ __");
  w.pair(72, "65");
  w.pair(73, "2");
  w.pair(40, 6);
  w.pair(49, 4);
  w.pair(49, -2);
  w.pair(0, "ENDTAB");
  w.pair(0, "TABLE");
  w.pair(2, "LAYER");
  w.pair(70, String(layers.length + 1));
  for (const l of [{ name: "0", color: 7, linetype: "CONTINUOUS" }, ...layers]) {
    w.pair(0, "LAYER");
    w.pair(2, l.name);
    w.pair(70, "0");
    w.pair(62, String(l.color));
    w.pair(6, l.linetype);
  }
  w.pair(0, "ENDTAB");
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");

  for (const poly of map.parks) for (const ring of poly) w.polyline("MAP-PARKS", ring, true);
  for (const poly of map.water) for (const ring of poly) w.polyline("MAP-WATER", ring, true);
  for (const line of map.waterways) w.polyline("MAP-WATERWAYS", line, false);
  for (const poly of map.buildings) for (const ring of poly) w.polyline("MAP-BUILDINGS", ring, true);
  for (const road of map.roads) {
    const layer = road.cls === "major" ? "MAP-ROADS-MAJOR" : road.cls === "minor" ? "MAP-ROADS-MINOR" : "MAP-PATHS";
    w.polyline(layer, road.line, false);
  }
  for (const line of map.railways) w.polyline("MAP-RAIL", line, false);
  for (const l of map.labels) w.text("MAP-STREET-NAMES", [l.x, l.y], 2.5, l.text, { rotation: l.angleDeg, center: true });

  spec.paths.forEach((p, i) => {
    w.polyline(pathLayers[i].name, p.points.map(local), false);
    if (p.cone.length >= 3) w.polyline("SUN-AREA", p.cone.map(local), true);
    if (p.marker) {
      const m = local(p.marker);
      w.circle("SUN-MARKERS", m, 2);
      w.text("SUN-MARKERS", [m[0] + 3, m[1] + 3], 2, p.timeLabel);
    }
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

  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.toString();
}

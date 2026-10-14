import type { Pt } from "./types";

export type Pt3 = [number, number, number];

export type DxfLayer = { name: string; color: number; linetype: "CONTINUOUS" | "DASHED" };

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

export function layerName(raw: string): string {
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

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : n.toFixed(4);
}

type PreambleOptions = {
  extMin: Pt3;
  extMax: Pt3;
  layers: DxfLayer[];
  /** Opens the drawing looking from this direction at the target, e.g. [-1, -1, 1] for a south-west isometric view. */
  view?: { direction: Pt3; target: Pt3; height: number };
};

/** Writes R12 ASCII DXF entities: 1 drawing unit = 1 metre. */
export class DxfWriter {
  private lines: string[] = [];

  pair(code: number, value: string | number): void {
    this.lines.push(String(code), typeof value === "number" ? formatNum(value) : value);
  }

  private point(base: number, [x, y, z]: Pt3): void {
    this.pair(base, x);
    this.pair(base + 10, y);
    this.pair(base + 20, z);
  }

  /** Header and tables, then opens the ENTITIES section. */
  preamble({ extMin, extMax, layers, view }: PreambleOptions): void {
    this.pair(0, "SECTION");
    this.pair(2, "HEADER");
    this.pair(9, "$ACADVER");
    this.pair(1, "AC1009");
    this.pair(9, "$EXTMIN");
    this.point(10, extMin);
    this.pair(9, "$EXTMAX");
    this.point(10, extMax);
    this.pair(0, "ENDSEC");

    this.pair(0, "SECTION");
    this.pair(2, "TABLES");

    if (view) {
      this.pair(0, "TABLE");
      this.pair(2, "VPORT");
      this.pair(70, "1");
      this.pair(0, "VPORT");
      this.pair(2, "*ACTIVE");
      this.pair(70, "0");
      this.pair(10, 0);
      this.pair(20, 0);
      this.pair(11, 1);
      this.pair(21, 1);
      this.pair(12, 0);
      this.pair(22, 0);
      this.pair(13, 0);
      this.pair(23, 0);
      this.pair(14, 1);
      this.pair(24, 1);
      this.pair(15, 1);
      this.pair(25, 1);
      this.point(16, view.direction);
      this.point(17, view.target);
      this.pair(40, view.height);
      this.pair(41, 1.6);
      this.pair(42, 50);
      this.pair(43, 0);
      this.pair(44, 0);
      this.pair(50, 0);
      this.pair(51, 0);
      this.pair(71, "0");
      this.pair(72, "100");
      this.pair(73, "1");
      this.pair(74, "3");
      this.pair(75, "0");
      this.pair(76, "0");
      this.pair(77, "0");
      this.pair(78, "0");
      this.pair(0, "ENDTAB");
    }

    this.pair(0, "TABLE");
    this.pair(2, "LTYPE");
    this.pair(70, "2");
    this.pair(0, "LTYPE");
    this.pair(2, "CONTINUOUS");
    this.pair(70, "0");
    this.pair(3, "Solid line");
    this.pair(72, "65");
    this.pair(73, "0");
    this.pair(40, 0);
    this.pair(0, "LTYPE");
    this.pair(2, "DASHED");
    this.pair(70, "0");
    this.pair(3, "Dashed __ __ __");
    this.pair(72, "65");
    this.pair(73, "2");
    this.pair(40, 6);
    this.pair(49, 4);
    this.pair(49, -2);
    this.pair(0, "ENDTAB");
    this.pair(0, "TABLE");
    this.pair(2, "LAYER");
    this.pair(70, String(layers.length + 1));
    for (const l of [{ name: "0", color: 7, linetype: "CONTINUOUS" }, ...layers]) {
      this.pair(0, "LAYER");
      this.pair(2, l.name);
      this.pair(70, "0");
      this.pair(62, String(l.color));
      this.pair(6, l.linetype);
    }
    this.pair(0, "ENDTAB");
    this.pair(0, "ENDSEC");

    this.pair(0, "SECTION");
    this.pair(2, "ENTITIES");
  }

  polyline(layer: string, pts: Pt[], closed: boolean, linetype?: string): void {
    if (pts.length < 2) return;
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    if (linetype) this.pair(6, linetype);
    this.pair(66, "1");
    this.point(10, [0, 0, 0]);
    this.pair(70, closed ? "1" : "0");
    for (const [x, y] of pts) {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.point(10, [x, y, 0]);
    }
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }

  /** A polyline whose vertices each keep their own height. */
  polyline3d(layer: string, pts: Pt3[], closed: boolean): void {
    if (pts.length < 2) return;
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    this.pair(66, "1");
    this.point(10, [0, 0, 0]);
    this.pair(70, String(8 | (closed ? 1 : 0)));
    for (const p of pts) {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.point(10, p);
      this.pair(70, "32");
    }
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }

  line(layer: string, a: Pt3, b: Pt3): void {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.point(10, a);
    this.point(11, b);
  }

  /** A triangle or quad surface; a triangle repeats its last corner as AutoCAD expects. */
  face(layer: string, corners: Pt3[]): void {
    if (corners.length < 3) return;
    const [a, b, c] = corners;
    const d = corners[3] ?? c;
    this.pair(0, "3DFACE");
    this.pair(8, layer);
    this.point(10, a);
    this.point(11, b);
    this.point(12, c);
    this.point(13, d);
  }

  circle(layer: string, [x, y]: Pt, r: number): void {
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.point(10, [x, y, 0]);
    this.pair(40, r);
  }

  text(
    layer: string,
    [x, y]: Pt,
    height: number,
    text: string,
    opts: { rotation?: number; center?: boolean; z?: number } = {},
  ): void {
    const z = opts.z ?? 0;
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.point(10, [x, y, z]);
    this.pair(40, height);
    this.pair(1, dxfText(text));
    if (opts.rotation) this.pair(50, opts.rotation);
    if (opts.center) {
      this.pair(72, "1");
      this.point(11, [x, y, z]);
      this.pair(73, "2");
    }
  }

  finish(): string {
    this.pair(0, "ENDSEC");
    this.pair(0, "EOF");
    return `${this.lines.join("\r\n")}\r\n`;
  }
}

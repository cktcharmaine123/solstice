import { diagramFrame, latLngToLocal } from "./geometry";
import { HK_BUILDINGS_CREDIT } from "./hkBuildings";
import type { DiagramSpec, MapOutlines, PolygonRings, Pt } from "./types";

const MAP_PX = 1000;
const MARGIN = 40;
const HEADER = 110;
const LEGEND_ROW = 26;
const FONT = "Inter, Helvetica, Arial, sans-serif";
const CONE_COLOR = "#f59e0b";
const CENTRE_COLOR = "#7a4a4a";

const STYLE = {
  background: "#f2f2f2",
  park: "#e2e6df",
  water: "#c9d3d9",
  waterway: "#b8c4cb",
  buildingFill: "#d9d9d9",
  buildingStroke: "#b5b5b5",
  roadCasing: "#c8c8c8",
  road: "#ffffff",
  rail: "#9a9a9a",
};

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

export function layerId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layer";
}

function niceScaleLength(totalM: number): number {
  const target = totalM / 5;
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500];
  return candidates.filter((c) => c <= target).pop() ?? 5;
}

/** Builds a north-up SVG with each part of the drawing in its own named layer. */
export function buildDiagramSvg(spec: DiagramSpec, map: MapOutlines): string {
  const h = spec.halfExtentM;
  const s = MAP_PX / (2 * h);
  const frame = diagramFrame(spec);
  const width = MAP_PX + MARGIN * 2;
  const mapBottom = HEADER + MAP_PX;
  const height = mapBottom + 40 + spec.paths.length * LEGEND_ROW + 70;

  const px = ([x, y]: Pt): string => `${(MARGIN + (x + h) * s).toFixed(2)},${(HEADER + (h - y) * s).toFixed(2)}`;
  const linePath = (pts: Pt[]) => (pts.length < 2 ? "" : `M${pts.map(px).join("L")}`);
  const polyPath = (rings: PolygonRings) => rings.map((r) => `M${r.map(px).join("L")}Z`).join("");
  const local = (p: [number, number]) => latLngToLocal(frame, p);

  const layer = (name: string, body: string, attrs = "") =>
    body ? `<g id="${layerId(name)}" inkscape:groupmode="layer" inkscape:label="${esc(name)}"${attrs}>${body}</g>\n` : "";
  const paths = (ds: string[], attrs: string) => ds.filter(Boolean).map((d) => `<path d="${d}" ${attrs}/>`).join("");

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
<title>${esc(spec.title)} - sun path diagram</title>
<rect width="${width}" height="${height}" fill="#ffffff"/>
<defs><clipPath id="map-clip"><rect x="${MARGIN}" y="${HEADER}" width="${MAP_PX}" height="${MAP_PX}"/></clipPath></defs>
`);

  parts.push(
    layer(
      "Title",
      `<text x="${MARGIN}" y="56" font-size="26" font-weight="600" fill="#2b2b2b">${esc(spec.title)}</text>` +
        `<text x="${MARGIN}" y="86" font-size="14" fill="#7a7a7a">Sun path diagram, north up, ${(2 * h).toFixed(0)} m x ${(2 * h).toFixed(0)} m</text>`,
    ),
  );

  const mapBody: string[] = [];
  mapBody.push(layer("Map background", `<rect x="${MARGIN}" y="${HEADER}" width="${MAP_PX}" height="${MAP_PX}" fill="${STYLE.background}"/>`));
  mapBody.push(layer("Parks", paths(map.parks.map(polyPath), `fill="${STYLE.park}" fill-rule="evenodd"`)));
  mapBody.push(layer("Water", paths(map.water.map(polyPath), `fill="${STYLE.water}" fill-rule="evenodd"`)));
  mapBody.push(
    layer("Waterways", paths(map.waterways.map(linePath), `fill="none" stroke="${STYLE.waterway}" stroke-width="${(3 * s).toFixed(2)}" stroke-linecap="round"`)),
  );
  mapBody.push(
    layer("Roads", [
      ...map.roads.map((r) => `<path d="${linePath(r.line)}" fill="none" stroke="${STYLE.roadCasing}" stroke-width="${((r.widthM + 1.5) * s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`),
      ...map.roads.map((r) => `<path d="${linePath(r.line)}" fill="none" stroke="${STYLE.road}" stroke-width="${(r.widthM * s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`),
    ].join("")),
  );
  mapBody.push(
    layer("Railways", paths(map.railways.map(linePath), `fill="none" stroke="${STYLE.rail}" stroke-width="${Math.max(1, 1.2 * s).toFixed(2)}" stroke-dasharray="${(6 * s).toFixed(1)} ${(3 * s).toFixed(1)}"`)),
  );
  mapBody.push(
    layer("Buildings", paths(map.buildings.map(polyPath), `fill="${STYLE.buildingFill}" stroke="${STYLE.buildingStroke}" stroke-width="0.8" fill-rule="evenodd"`)),
  );

  mapBody.push(
    layer(
      "Sun area",
      spec.paths
        .filter((p) => p.cone.length >= 3)
        .map((p) => `<path d="M${p.cone.map(local).map(px).join("L")}Z" fill="${CONE_COLOR}" fill-opacity="0.15"/>`)
        .join(""),
    ),
  );

  spec.paths.forEach((p, i) => {
    const dash = p.dashed ? ` stroke-dasharray="8 10"` : "";
    mapBody.push(
      layer(
        i === 0 ? `Sun path - ${p.dateLabel}` : `Comparison ${i} - ${p.label}`,
        `<path d="${linePath(p.points.map(local))}" fill="none" stroke="${p.color}" stroke-width="${p.dashed ? 2.5 : 3}" stroke-opacity="${p.dashed ? 0.8 : 0.95}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
      ),
    );
  });

  mapBody.push(
    layer(
      "Sun markers",
      spec.paths
        .filter((p) => p.marker)
        .map((p) => {
          const [x, y] = px(local(p.marker as [number, number])).split(",").map(Number);
          const rays = Array.from({ length: 8 }, (_, k) => {
            const a = (k * Math.PI) / 4;
            return `M${(x + 9 * Math.cos(a)).toFixed(2)},${(y + 9 * Math.sin(a)).toFixed(2)}L${(x + 13 * Math.cos(a)).toFixed(2)},${(y + 13 * Math.sin(a)).toFixed(2)}`;
          }).join("");
          return `<g><circle cx="${x}" cy="${y}" r="6" fill="${p.color}"/><path d="${rays}" stroke="${p.color}" stroke-width="2" stroke-linecap="round"/></g>`;
        })
        .join(""),
    ),
  );

  const [cx, cy] = px([0, 0]).split(",");
  mapBody.push(layer("Site centre", `<circle cx="${cx}" cy="${cy}" r="6" fill="${CENTRE_COLOR}" stroke="#ffffff" stroke-width="2"/>`));

  parts.push(`<g clip-path="url(#map-clip)">\n${mapBody.join("")}</g>\n`);
  parts.push(layer("Frame", `<rect x="${MARGIN}" y="${HEADER}" width="${MAP_PX}" height="${MAP_PX}" fill="none" stroke="#bdbdbd" stroke-width="1"/>`));

  const nx = MARGIN + MAP_PX - 46;
  const ny = HEADER + 46;
  parts.push(
    layer(
      "North arrow",
      `<circle cx="${nx}" cy="${ny}" r="28" fill="#ffffff" fill-opacity="0.92" stroke="#d0d0d0"/>` +
        `<path d="M${nx},${ny - 20}L${nx - 7},${ny + 6}L${nx},${ny + 1}L${nx + 7},${ny + 6}Z" fill="#ef4444"/>` +
        `<text x="${nx}" y="${ny + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="${CENTRE_COLOR}">N</text>`,
    ),
  );

  const legendTop = mapBottom + 40;
  parts.push(
    layer(
      "Legend",
      spec.paths
        .map((p, i) => {
          const y = legendTop + i * LEGEND_ROW;
          const dash = p.dashed ? ` stroke-dasharray="6 6"` : "";
          return (
            `<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + 36}" y2="${y}" stroke="${p.color}" stroke-width="3"${dash}/>` +
            `<text x="${MARGIN + 48}" y="${y + 5}" font-size="14" fill="#333333">${esc(i === 0 ? p.dateLabel : `${p.label} (${p.dateLabel})`)}</text>` +
            `<text x="${MARGIN + 360}" y="${y + 5}" font-size="14" fill="#7a7a7a">Sun at ${esc(p.timeLabel)}</text>`
          );
        })
        .join(""),
    ),
  );

  const scaleM = niceScaleLength(2 * h);
  const scalePx = scaleM * s;
  const sy = legendTop + spec.paths.length * LEGEND_ROW + 24;
  const sx = MARGIN;
  parts.push(
    layer(
      "Scale bar",
      `<path d="M${sx},${sy - 6}V${sy}H${sx + scalePx}V${sy - 6}M${sx + scalePx / 2},${sy}V${sy - 4}" fill="none" stroke="#333333" stroke-width="1.5"/>` +
        `<text x="${sx}" y="${sy + 18}" font-size="12" fill="#555555">0</text>` +
        `<text x="${sx + scalePx}" y="${sy + 18}" text-anchor="middle" font-size="12" fill="#555555">${scaleM} m</text>` +
        `<text x="${MARGIN + MAP_PX}" y="${sy + 18}" text-anchor="end" font-size="11" fill="#9a9a9a">Map data (c) OpenStreetMap contributors, OpenMapTiles</text>` +
        (map.hkBuildings
          ? `<text x="${MARGIN + MAP_PX}" y="${sy + 34}" text-anchor="end" font-size="11" fill="#9a9a9a">${HK_BUILDINGS_CREDIT}</text>`
          : ""),
    ),
  );

  parts.push("</svg>\n");
  return parts.join("");
}

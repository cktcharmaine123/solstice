import { allPolygonRings, pointInPolygon, polygonCentroid } from "./geometry";
import { partHeights, RAISED_PART_OVERLAP_M } from "./buildingProps";

export const FILLER_SOURCE = "building-fillers";
export const FILLER_LAYER = "building-fillers";

const MIN_THICK_PART_M = 8;
const SUPPORT_TOLERANCE_M = 2;

type Bbox = [number, number, number, number];

type Piece = {
  id: string | number | undefined;
  geometry: any;
  polys: number[][][][];
  bbox: Bbox;
  centroid: [number, number] | null;
  base: number;
  height: number;
};

function toPiece(f: any): Piece | null {
  const polys = allPolygonRings(f.geometry);
  if (polys.length === 0) return null;
  const bbox: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polys) {
    for (const [x, y] of rings[0]) {
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
    }
  }
  const { height, base } = partHeights(f.properties);
  return { id: f.id, geometry: f.geometry, polys, bbox, centroid: polygonCentroid(polys[0]), base, height };
}

function covers(outer: Piece, pt: [number, number] | null): boolean {
  if (!pt) return false;
  const [x, y] = pt;
  if (x < outer.bbox[0] || x > outer.bbox[2] || y < outer.bbox[1] || y > outer.bbox[3]) return false;
  return outer.polys.some((rings) => pointInPolygon(x, y, rings));
}

function fillerFeature(geometry: any, base: number, top: number) {
  return { type: "Feature", geometry, properties: { base, top } };
}

/**
 * Builds solid blocks for the lower sections the map data leaves empty:
 * under complexes whose mapped pieces all start above ground, for hidden outlines with no pieces at all,
 * and under thick raised pieces with nothing beneath them.
 */
export function computeBuildingFillers(sourceFeatures: any[]): any {
  const seen = new Set<string>();
  const shells: Piece[] = [];
  const parts: Piece[] = [];
  for (const f of sourceFeatures) {
    const first = allPolygonRings(f.geometry)[0]?.[0]?.[0];
    const key = `${f.id}:${first?.[0]}:${first?.[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const piece = toPiece(f);
    if (!piece) continue;
    if (f.properties?.hide_3d === true) shells.push(piece);
    else if (piece.height - piece.base >= 0.5) parts.push(piece);
  }

  const lowestBaseByShell = new Map<string | number | undefined, number>();
  for (const shell of shells) {
    for (const part of parts) {
      if (!covers(shell, part.centroid)) continue;
      const prev = lowestBaseByShell.get(shell.id);
      if (prev === undefined || part.base < prev) lowestBaseByShell.set(shell.id, part.base);
    }
  }

  const fillers: any[] = [];
  const supports: Piece[] = [...parts];
  for (const shell of shells) {
    const lowest = lowestBaseByShell.get(shell.id);
    if (lowest === undefined) {
      fillers.push(fillerFeature(shell.geometry, shell.base, shell.height));
      supports.push(shell);
    } else if (lowest > 0.5) {
      const top = Math.max(0.5, lowest - RAISED_PART_OVERLAP_M);
      fillers.push(fillerFeature(shell.geometry, 0, top));
      supports.push({ ...shell, base: 0, height: top + RAISED_PART_OVERLAP_M });
    }
  }

  for (const part of parts) {
    if (part.base <= 0.5 || part.height - part.base < MIN_THICK_PART_M) continue;
    const supported = supports.some(
      (s) => s !== part && s.base < part.base && s.height >= part.base - SUPPORT_TOLERANCE_M && covers(s, part.centroid),
    );
    if (!supported) {
      fillers.push(fillerFeature(part.geometry, 0, Math.max(0.5, part.base - RAISED_PART_OVERLAP_M)));
    }
  }

  return { type: "FeatureCollection", features: fillers };
}

export function addBuildingFillerLayer(map: any, color: string): void {
  if (!map.getSource(FILLER_SOURCE)) {
    map.addSource(FILLER_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!map.getLayer(FILLER_LAYER)) {
    map.addLayer({
      id: FILLER_LAYER,
      source: FILLER_SOURCE,
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": color,
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }
}

/** Recomputes fillers whenever new building tiles arrive, once the map settles. */
export function watchBuildingFillers(map: any, buildingSourceId: string): void {
  let dirty = true;
  const onSourceData = (e: any) => {
    if (e.sourceId === buildingSourceId && e.tile) dirty = true;
  };
  const onIdle = () => {
    if (!dirty) return;
    const source = map.getSource(FILLER_SOURCE);
    if (!source || !map.getSource(buildingSourceId)) return;
    dirty = false;
    try {
      const features = map.querySourceFeatures(buildingSourceId, { sourceLayer: "building" });
      source.setData(computeBuildingFillers(features));
    } catch (err) {
      console.warn("Failed to update building fillers:", err);
    }
  };
  map.on("sourcedata", onSourceData);
  map.on("idle", onIdle);
}

import { allPolygonRings, createLocalFrame, findHitPolygon, openRing, pointInRing, type Pt } from "./geometry";
import { partHeights } from "./buildingProps";

export type SelectedBuilding = {
  feature: any;
  geometry: any;
};

export function deduplicateFeatures(
  features: any[],
  tapLng?: number,
  tapLat?: number,
  maxSelectDistanceMeters: number = 100
): SelectedBuilding | null {
  if (!features || features.length === 0) return null;

  const candidates = features.map((f) => {
    const { height, base: minHeight } = partHeights(f.properties);

    let containsTap = false;
    let hitRings: number[][][] | null = null;

    if (tapLng !== undefined && tapLat !== undefined && f.geometry) {
      hitRings = findHitPolygon(tapLng, tapLat, f.geometry);
      containsTap = hitRings !== null;
    }

    return {
      feature: f,
      height,
      minHeight,
      span: height - minHeight,
      containsTap,
      hitRings,
    };
  });

  const containing = candidates.filter((c) => c.containsTap);
  const pool = containing.length > 0 ? containing : candidates;

  pool.sort((a, b) => {
    if (Math.abs(b.minHeight - a.minHeight) > 1) {
      return b.minHeight - a.minHeight;
    }
    return b.height - a.height;
  });

  const winner = pool[0];

  let geometry: any;
  if (winner.hitRings) {
    geometry = { type: "Polygon", coordinates: winner.hitRings };
  } else if (tapLng !== undefined && tapLat !== undefined && winner.feature.geometry?.type === "MultiPolygon") {
    const rings = findHitPolygon(tapLng, tapLat, winner.feature.geometry);
    geometry = rings ? { type: "Polygon", coordinates: rings } : winner.feature.geometry;
  } else {
    geometry = winner.feature.geometry;
  }

  return { feature: winner.feature, geometry };
}

const PART_TOUCH_M = 0.75;
const PART_HEIGHT_TOLERANCE_M = 1.5;

function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function ringsTouch(a: Pt[], b: Pt[]): boolean {
  const near = (pts: Pt[], ring: Pt[]) =>
    pts.some((p) =>
      pointInRing(p[0], p[1], ring) ||
      ring.some((q, i) => pointSegmentDistance(p, q, ring[(i + 1) % ring.length]) <= PART_TOUCH_M),
    );
  return near(a, b) || near(b, a);
}

/** Joins every footprint piece of the tapped building (tile-split pieces and same-height parts) into one shape. */
export function collectBuildingParts(selection: SelectedBuilding, features: any[]): any {
  const seedRings = allPolygonRings(selection.geometry)[0];
  if (!seedRings) return selection.geometry;
  const seedId = selection.feature.id;
  const { height: seedHeight, base: seedBase } = partHeights(selection.feature.properties);
  const frame = createLocalFrame(seedRings[0][0][0], seedRings[0][0][1]);
  const toLocal = (ring: number[][]) => openRing(ring).map(([lng, lat]) => frame.toLocal(lng, lat));

  type Part = { rings: number[][][]; outer: Pt[]; sameId: boolean };
  const seen = new Set<string>();
  const keyOf = (rings: number[][][]) =>
    rings[0].length + ":" + rings[0].map((c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`).sort()[0];
  seen.add(keyOf(seedRings));

  const candidates: Part[] = [];
  for (const f of features) {
    const sameId = seedId !== undefined && f.id === seedId;
    const { height, base } = partHeights(f.properties);
    const similar = Math.abs(height - seedHeight) <= PART_HEIGHT_TOLERANCE_M &&
      Math.abs(base - seedBase) <= PART_HEIGHT_TOLERANCE_M;
    if (!sameId && !similar) continue;
    for (const rings of allPolygonRings(f.geometry)) {
      if (!rings[0] || rings[0].length < 4) continue;
      const key = keyOf(rings);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ rings, outer: toLocal(rings[0]), sameId });
    }
  }

  const joined: Part[] = [{ rings: seedRings, outer: toLocal(seedRings[0]), sameId: true }];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (joined.some((j) => ringsTouch(j.outer, candidates[i].outer))) {
        joined.push(candidates[i]);
        candidates.splice(i, 1);
        grew = true;
      }
    }
  }

  if (joined.length === 1) return { type: "Polygon", coordinates: seedRings };
  return { type: "MultiPolygon", coordinates: joined.map((j) => j.rings) };
}

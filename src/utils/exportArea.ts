import { createLocalFrame } from "./heatmap3d/geometry";

export const EXPORT_AREA_MIN_M = 100;
export const EXPORT_AREA_MAX_M = 1000;
export const EXPORT_AREA_STEP_M = 50;

/** Snaps a distance to the slider's range and step. */
export function snapExportArea(m: number): number {
  const snapped = Math.round(m / EXPORT_AREA_STEP_M) * EXPORT_AREA_STEP_M;
  return Math.min(EXPORT_AREA_MAX_M, Math.max(EXPORT_AREA_MIN_M, snapped));
}

/** Corners of the north-up square reaching `halfExtentM` from the centre, as [lng, lat], closed. */
export function exportAreaRing(center: { lat: number; lng: number }, halfExtentM: number): [number, number][] {
  const frame = createLocalFrame(center.lng, center.lat);
  const h = halfExtentM;
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const ring = corners.map(([x, y]) => frame.toLngLat(x, y) as [number, number]);
  return [...ring, ring[0]];
}

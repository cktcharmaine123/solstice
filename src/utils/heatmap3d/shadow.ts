import { METERS_PER_DEG, type NearbyBuilding } from "./types";

export function isPointShadowedByBuilding(
  pointLng: number,
  pointLat: number,
  pointHeight: number,
  sunDirX: number,
  sunDirY: number,
  tanAlt: number,
  nearby: NearbyBuilding[],
): boolean {
  for (const nb of nearby) {
    const dLng = (nb.lng - pointLng) * METERS_PER_DEG * Math.cos(pointLat * Math.PI / 180);
    const dLat = (nb.lat - pointLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const heightAtPoint = nb.height - along * tanAlt;
    if (heightAtPoint < pointHeight) continue;
    return true;
  }
  return false;
}

export function isWallSegmentShadowed(
  segLng: number,
  segLat: number,
  segHeight: number,
  wallNormalX: number,
  wallNormalY: number,
  sunDirX: number,
  sunDirY: number,
  sunAltRad: number,
  tanAlt: number,
  nearby: NearbyBuilding[],
): boolean {
  const dot = sunDirX * wallNormalX + sunDirY * wallNormalY;
  if (dot <= 0) return true;

  for (const nb of nearby) {
    const dLng = (nb.lng - segLng) * METERS_PER_DEG * Math.cos(segLat * Math.PI / 180);
    const dLat = (nb.lat - segLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const heightAtPoint = nb.height - along * tanAlt;
    if (heightAtPoint < segHeight) continue;
    return true;
  }
  return false;
}

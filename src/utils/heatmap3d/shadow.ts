import { METERS_PER_DEG, type NearbyBuilding, type TerrainSampler } from "./types";

export function isPointShadowedByBuilding(
  pointLng: number,
  pointLat: number,
  pointHeight: number,
  sunDirX: number,
  sunDirY: number,
  tanAlt: number,
  nearby: NearbyBuilding[],
  terrainSampler?: TerrainSampler | null,
  pointGroundElevation?: number,
): boolean {
  const groundElev = pointGroundElevation ?? (terrainSampler ? (terrainSampler(pointLng, pointLat) ?? 0) : 0);
  const absoluteHeight = groundElev + pointHeight;

  for (const nb of nearby) {
    const dLng = (nb.lng - pointLng) * METERS_PER_DEG * Math.cos(pointLat * Math.PI / 180);
    const dLat = (nb.lat - pointLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const nbAbsoluteTop = nb.groundElevation + nb.height;
    if (nbAbsoluteTop < absoluteHeight) continue;
    return true;
  }

  if (terrainSampler) {
    const stepCount = 8;
    for (let s = 1; s <= stepCount; s++) {
      const frac = s / stepCount;
      const distM = frac * 250;
      const sampleLng = pointLng + (sunDirX * distM) / (METERS_PER_DEG * Math.cos(pointLat * Math.PI / 180));
      const sampleLat = pointLat + (sunDirY * distM) / METERS_PER_DEG;
      const terrainElev = terrainSampler(sampleLng, sampleLat);
      if (terrainElev === null) continue;
      const terrainAbove = terrainElev - groundElev;
      const sunHeightAtDist = distM * tanAlt;
      if (terrainAbove > sunHeightAtDist && terrainAbove > pointHeight) {
        return true;
      }
    }
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
  terrainSampler?: TerrainSampler | null,
  segGroundElevation?: number,
): boolean {
  const dot = sunDirX * wallNormalX + sunDirY * wallNormalY;
  if (dot <= 0) return true;

  const groundElev = segGroundElevation ?? (terrainSampler ? (terrainSampler(segLng, segLat) ?? 0) : 0);
  const absoluteSegHeight = groundElev + segHeight;

  for (const nb of nearby) {
    const dLng = (nb.lng - segLng) * METERS_PER_DEG * Math.cos(segLat * Math.PI / 180);
    const dLat = (nb.lat - segLat) * METERS_PER_DEG;
    const along = dLng * sunDirX + dLat * sunDirY;
    if (along <= 0) continue;
    const perp = Math.abs(dLng * sunDirY - dLat * sunDirX);
    const shadowLen = tanAlt > 0.05 ? nb.height / tanAlt : 300;
    if (shadowLen < along) continue;
    if (perp > 25) continue;
    const nbAbsoluteTop = nb.groundElevation + nb.height;
    if (nbAbsoluteTop < absoluteSegHeight) continue;
    return true;
  }

  if (terrainSampler) {
    const stepCount = 8;
    for (let s = 1; s <= stepCount; s++) {
      const frac = s / stepCount;
      const distM = frac * 250;
      const sampleLng = segLng + (sunDirX * distM) / (METERS_PER_DEG * Math.cos(segLat * Math.PI / 180));
      const sampleLat = segLat + (sunDirY * distM) / METERS_PER_DEG;
      const terrainElev = terrainSampler(sampleLng, sampleLat);
      if (terrainElev === null) continue;
      const terrainAbove = terrainElev - groundElev;
      const sunHeightAtDist = distM * tanAlt;
      if (terrainAbove > sunHeightAtDist && terrainAbove > segHeight) {
        return true;
      }
    }
  }

  return false;
}

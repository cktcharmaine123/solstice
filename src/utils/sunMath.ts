import * as SunCalc from "suncalc";

const R_MAX = 150;
const CONE_BASE_HALF_WIDTH_M = 15;
const METERS_PER_DEG = 111320;
const PATH_STEPS = 50;

export type SunPathData = {
  pathPoints: [number, number][];
  sunMarkerPos: [number, number] | null;
  displayAltitude: number;
  displayAzimuth: number;
  sunConePolygon: [number, number][];
};

export function calculateSunPathData(
  date: Date,
  currentTime: Date,
  center: { lat: number; lng: number },
): SunPathData {
  if (!center || !date || !currentTime) {
    return { pathPoints: [], sunMarkerPos: null, displayAltitude: 0, displayAzimuth: 0, sunConePolygon: [] };
  }

  const siteLat = Number(center.lat);
  const siteLng = Number(center.lng);

  const times = SunCalc.getTimes(date, siteLat, siteLng);
  const sunriseMs = times.sunrise.getTime();
  const sunsetMs = times.sunset.getTime();

  const points: [number, number][] = [];

  for (let i = 0; i <= PATH_STEPS; i++) {
    const stepTime = new Date(sunriseMs + (i / PATH_STEPS) * (sunsetMs - sunriseMs));
    const pos = SunCalc.getPosition(stepTime, siteLat, siteLng);

    const azimuthRad = pos.azimuth * (Math.PI / 180);

    const dynamicR = R_MAX * (1 - (Math.max(0, pos.altitude) / 90));
    const dx = dynamicR * Math.sin(azimuthRad);
    const dy = -dynamicR * Math.cos(azimuthRad);

    const lat = siteLat + (dy / METERS_PER_DEG);
    const lng = siteLng + (dx / (METERS_PER_DEG * Math.cos(siteLat * Math.PI / 180)));

    points.push([lat, lng]);
  }

  const activePos = SunCalc.getPosition(currentTime, siteLat, siteLng);
  const activeAzRad = activePos.azimuth * (Math.PI / 180);

  const dynamicR_active = R_MAX * (1 - (Math.max(0, activePos.altitude) / 90));
  const dx_active = dynamicR_active * Math.sin(activeAzRad);
  const dy_active = -dynamicR_active * Math.cos(activeAzRad);
  const markerLat = siteLat + (dy_active / METERS_PER_DEG);
  const markerLng = siteLng + (dx_active / (METERS_PER_DEG * Math.cos(siteLat * Math.PI / 180)));

  const altDeg = Math.max(0, Math.round(activePos.altitude));
  const azDeg = (Math.round(((activePos.azimuth + 360) % 360) * 10) / 10);

  let cone: [number, number][] = [];
  if (activePos.altitude > 0) {
    const halfW = CONE_BASE_HALF_WIDTH_M;
    const perpAz1 = activeAzRad + Math.PI / 2;
    const perpAz2 = activeAzRad - Math.PI / 2;
    const toLat = (dy: number) => siteLat + (dy / METERS_PER_DEG);
    const toLng = (dx: number) =>
      siteLng + (dx / (METERS_PER_DEG * Math.cos((siteLat * Math.PI) / 180)));
    const base1: [number, number] = [
      toLat(-halfW * Math.cos(perpAz1)),
      toLng(halfW * Math.sin(perpAz1)),
    ];
    const base2: [number, number] = [
      toLat(-halfW * Math.cos(perpAz2)),
      toLng(halfW * Math.sin(perpAz2)),
    ];
    cone = [
      [markerLat, markerLng],
      base1,
      base2,
    ];
  }

  return {
    pathPoints: points,
    sunMarkerPos: [markerLat, markerLng],
    displayAltitude: altDeg,
    displayAzimuth: azDeg,
    sunConePolygon: cone,
  };
}

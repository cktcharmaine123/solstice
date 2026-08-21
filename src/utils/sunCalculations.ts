import * as SunCalc from "suncalc";

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;

export type SunTimes = { sunrise: Date; sunset: Date; noon: Date } | null;

export type SunPosition = {
  altitude: number;
  azimuth: number;
};

export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatShortDate(date: Date): string {
  if (!isValidDate(date)) return "—";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function formatClock(date: Date, timeZone?: string): string {
  if (!isValidDate(date)) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

export function toTimeInputValue(date: Date, timeZone?: string): string {
  if (!isValidDate(date)) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const hh = h === "24" ? "00" : h.padStart(2, "0");
    return `${hh}:${m.padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function displayedMinutes(date: Date, timeZone?: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return 0;
  }
}

export function timeInputToSlider(timeStr: string, sunTimes: SunTimes, timeZone?: string): number {
  if (!sunTimes || !timeStr) return 50;
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 50;
  const target = h * 60 + m;
  const sunriseMin = displayedMinutes(sunTimes.sunrise, timeZone);
  let sunsetMin = displayedMinutes(sunTimes.sunset, timeZone);
  if (sunsetMin <= sunriseMin) sunsetMin += 1440;
  let t = target;
  if (t < sunriseMin) t += 1440;
  const span = sunsetMin - sunriseMin;
  if (span <= 0) return 50;
  const slider = ((t - sunriseMin) / span) * 100;
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, slider));
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function azimuthToCompass(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return COMPASS_16[idx];
}

export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
  if (!isValidDate(date) || isNaN(lat) || isNaN(lng)) return null;
  const times = SunCalc.getTimes(date, lat, lng);
  if (!isValidDate(times.sunrise) || !isValidDate(times.sunset)) return null;
  return { sunrise: times.sunrise, sunset: times.sunset, noon: times.solarNoon };
}

export function sunPosition3D(
  date: Date,
  lat: number,
  lng: number,
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
  };
}

export function getSelectedDateTime(sunTimes: SunTimes, selectedTime: number): Date {
  if (!sunTimes) return new Date();
  const sunriseMs = sunTimes.sunrise.getTime();
  const sunsetMs = sunTimes.sunset.getTime();
  if (sunsetMs <= sunriseMs) return sunTimes.noon;
  return new Date(sunriseMs + (selectedTime / 100) * (sunsetMs - sunriseMs));
}

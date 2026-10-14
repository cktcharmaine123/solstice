export type SunlightBand = { key: string; minHours: number; color: string; label: string };

/** Ordered from least to most sunlight; each band runs up to the next band's minimum. */
export const SUNLIGHT_BANDS: SunlightBand[] = [
  { key: "under-1h", minHours: 0, color: "#3B82F6", label: "Under 1 hr" },
  { key: "1-4h", minHours: 1, color: "#60A5FA", label: "1-4 hrs" },
  { key: "4-6h", minHours: 4, color: "#FACC15", label: "4-6 hrs" },
  { key: "6-8h", minHours: 6, color: "#F97316", label: "6-8 hrs" },
  { key: "8h-plus", minHours: 8, color: "#EF4444", label: "8+ hrs" },
];

export function sunlightBandIndex(hours: number): number {
  let index = 0;
  SUNLIGHT_BANDS.forEach((band, i) => {
    if (hours >= band.minHours) index = i;
  });
  return index;
}

export function sunlightColor(hours: number): string {
  return SUNLIGHT_BANDS[sunlightBandIndex(hours)].color;
}

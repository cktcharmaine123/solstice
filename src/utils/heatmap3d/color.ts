export function sunlightColor(hours: number): string {
  if (hours < 1) return "#3B82F6";
  if (hours < 4) return "#60A5FA";
  if (hours < 6) return "#FACC15";
  if (hours < 8) return "#F97316";
  return "#EF4444";
}

import { buildDiagramDxf } from "./dxf";
import { computeHalfExtent } from "./geometry";
import { emptyMapOutlines, fetchMapOutlines } from "./mapData";
import { buildDiagramSvg } from "./svg";
import type { DiagramPath, DiagramSpec, ExportFormat, MapOutlines } from "./types";

export type { DiagramPath, DiagramSpec, ExportFormat, MapOutlines };
export { fetchMapOutlines, emptyMapOutlines };

export function createDiagramSpec(title: string, center: { lat: number; lng: number }, paths: DiagramPath[]): DiagramSpec {
  return {
    version: 1,
    center: { lat: center.lat, lng: center.lng },
    halfExtentM: computeHalfExtent(center, paths.map((p) => [...p.points, ...p.cone])),
    title,
    paths,
  };
}

export function isDiagramSpec(value: unknown): value is DiagramSpec {
  const v = value as DiagramSpec | null;
  return (
    !!v &&
    v.version === 1 &&
    typeof v.center?.lat === "number" &&
    typeof v.center?.lng === "number" &&
    typeof v.halfExtentM === "number" &&
    Array.isArray(v.paths)
  );
}

export function renderDiagram(spec: DiagramSpec, map: MapOutlines, format: ExportFormat): Blob {
  return format === "svg"
    ? new Blob([buildDiagramSvg(spec, map)], { type: "image/svg+xml;charset=utf-8" })
    : new Blob([buildDiagramDxf(spec, map)], { type: "application/dxf" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "sun-path";
}

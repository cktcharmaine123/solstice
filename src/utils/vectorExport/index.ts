import type { TranslationKey } from "../../i18n/translations";
import { buildDiagramDxf } from "./dxf";
import { computeHalfExtent } from "./geometry";
import { emptyMapOutlines, fetchMapOutlines } from "./mapData";
import { buildDiagramSvg } from "./svg";
import type { DiagramPath, DiagramSpec, ExportFormat } from "./types";

export type { DiagramPath, DiagramSpec, ExportFormat };

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

/** Optional map data that could not be loaded; the export can be retried without it. */
export class ExportDataError extends Error {
  constructor(
    readonly messageKey: TranslationKey,
    readonly retryKey: TranslationKey,
  ) {
    super(messageKey);
  }
}

export function fileBlob(content: string, format: ExportFormat): Blob {
  return new Blob([content], { type: format === "svg" ? "image/svg+xml;charset=utf-8" : "application/dxf" });
}

export function fileExtension(format: ExportFormat): string {
  return format === "obj" ? "zip" : format;
}

export async function exportDiagram(spec: DiagramSpec, format: ExportFormat, skipMissing: boolean): Promise<Blob> {
  let map = emptyMapOutlines();
  if (!skipMissing) {
    try {
      map = await fetchMapOutlines(spec);
    } catch (err) {
      console.warn("Street map for export failed:", err);
      throw new ExportDataError("export.mapFailed", "export.withoutMap");
    }
  }
  return fileBlob(format === "svg" ? buildDiagramSvg(spec, map) : buildDiagramDxf(spec, map), format);
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

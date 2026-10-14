import { FileImage, Loader2, PenTool, Ruler, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "../i18n/LanguageContext";
import {
  downloadBlob,
  emptyMapOutlines,
  fetchMapOutlines,
  renderDiagram,
  safeFileName,
  type DiagramSpec,
  type ExportFormat,
  type MapOutlines,
} from "../utils/vectorExport";

type Props = {
  open: boolean;
  onClose: () => void;
  diagram: DiagramSpec | null;
  fileBaseName: string;
  onDownloadPng?: () => void;
};

type Status = { kind: "idle" } | { kind: "busy"; format: ExportFormat } | { kind: "mapFailed"; format: ExportFormat } | { kind: "failed" };

export function VectorExportDialog({ open, onClose, diagram, fileBaseName, onDownloadPng }: Props): JSX.Element | null {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const mapCache = useRef<{ key: string; map: MapOutlines } | null>(null);

  useEffect(() => {
    if (open) setStatus({ kind: "idle" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const busy = status.kind === "busy";

  const runExport = async (format: ExportFormat, includeMap: boolean): Promise<void> => {
    if (!diagram || busy) return;
    setStatus({ kind: "busy", format });
    let map = emptyMapOutlines();
    if (includeMap) {
      const key = `${diagram.center.lat},${diagram.center.lng},${diagram.halfExtentM}`;
      try {
        if (mapCache.current?.key !== key) mapCache.current = { key, map: await fetchMapOutlines(diagram) };
        map = mapCache.current.map;
      } catch (err) {
        console.warn("Street map for export failed:", err);
        setStatus({ kind: "mapFailed", format });
        return;
      }
    }
    try {
      downloadBlob(renderDiagram(diagram, map, format), `${safeFileName(fileBaseName)}.${format}`);
      setStatus({ kind: "idle" });
    } catch (err) {
      console.warn("Export failed:", err);
      setStatus({ kind: "failed" });
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vector-export-title"
        className="w-[440px] max-w-[calc(100vw-32px)] animate-slide-up rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="vector-export-title" className="font-['Inter'] text-lg font-semibold leading-tight text-[#7a4a4a]">
            {t("export.title")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-10 w-10 p-0 text-[#7a4a4a] hover:bg-neutral-100"
            aria-label={t("analysis.close")}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-2">
          {onDownloadPng && (
            <ExportOption
              icon={<FileImage className="h-5 w-5" aria-hidden="true" />}
              title={t("export.png")}
              description={t("export.pngDesc")}
              disabled={busy}
              onClick={() => {
                onDownloadPng();
                onClose();
              }}
            />
          )}
          <ExportOption
            icon={<PenTool className="h-5 w-5" aria-hidden="true" />}
            title={t("export.svg")}
            description={t("export.svgDesc")}
            disabled={!diagram || busy}
            loading={status.kind === "busy" && status.format === "svg"}
            onClick={() => void runExport("svg", true)}
          />
          <ExportOption
            icon={<Ruler className="h-5 w-5" aria-hidden="true" />}
            title={t("export.dxf")}
            description={t("export.dxfDesc")}
            disabled={!diagram || busy}
            loading={status.kind === "busy" && status.format === "dxf"}
            onClick={() => void runExport("dxf", true)}
          />
        </div>

        <div className="mt-4 min-h-[20px] font-['Inter'] text-xs leading-[1.5]" aria-live="polite">
          {!diagram && <p className="text-[#828282]">{t("export.unavailable")}</p>}
          {busy && <p className="text-[#828282]">{t("export.preparing")}</p>}
          {status.kind === "failed" && <p className="text-red-600">{t("export.failed")}</p>}
          {status.kind === "mapFailed" && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <p>{t("export.mapFailed")}</p>
              <button
                type="button"
                onClick={() => void runExport(status.format, false)}
                className="shrink-0 rounded-md bg-white px-2.5 py-1.5 font-medium text-[#7a4a4a] shadow-sm transition-colors hover:bg-neutral-50"
              >
                {t("export.withoutMap")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportOption({
  icon,
  title,
  description,
  disabled,
  loading,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 rounded-xl border border-[#eee] px-4 py-3 text-left transition-all duration-150 hover:border-[#7a4a4a]/30 hover:bg-[#7a4a4a]/[0.04] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#eee] disabled:hover:bg-transparent"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f6f6f6] text-[#7a4a4a] transition-colors group-hover:bg-white">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-['Inter'] text-sm font-semibold leading-tight text-[#333]">{title}</span>
        <span className="mt-0.5 font-['Inter'] text-xs leading-[1.5] text-[#828282]">{description}</span>
      </span>
    </button>
  );
}

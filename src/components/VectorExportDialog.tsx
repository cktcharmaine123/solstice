import { ArrowLeft, Box, FileImage, Loader2, PenTool, Ruler, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";
import { EXPORT_AREA_MAX_M, EXPORT_AREA_MIN_M, EXPORT_AREA_STEP_M } from "../utils/exportArea";
import { downloadBlob, ExportDataError, fileExtension, safeFileName, type ExportFormat } from "../utils/vectorExport";

export type ExportFile = (format: ExportFormat, skipMissing: boolean) => Promise<Blob>;

export type ExportAreaControl = {
  /** Distance in metres from the point to each edge of the exported square. */
  valueM: number;
  onChange: (valueM: number) => void;
  /** Shows a "may take longer" note above this distance. */
  slowAboveM?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Null when there is nothing to export yet; `unavailableMessage` explains why. */
  exportFile: ExportFile | null;
  fileBaseName: string;
  onDownloadPng?: () => void;
  title?: string;
  svgDescription?: string;
  dxfDescription?: string;
  /** Shows the OBJ option when set. */
  objDescription?: string;
  unavailableMessage?: string;
  notice?: string;
  /** When set, the window opens on a step for choosing the export area first. */
  area?: ExportAreaControl;
};

type Status =
  | { kind: "idle" }
  | { kind: "busy"; format: ExportFormat }
  | { kind: "missing"; format: ExportFormat; messageKey: TranslationKey; retryKey: TranslationKey }
  | { kind: "failed" };

export function VectorExportDialog({
  open,
  onClose,
  exportFile,
  fileBaseName,
  onDownloadPng,
  title,
  svgDescription,
  dxfDescription,
  objDescription,
  unavailableMessage,
  notice,
  area,
}: Props): JSX.Element | null {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [step, setStep] = useState<"area" | "format">("format");
  const hasArea = !!area;

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: "idle" });
    setStep(hasArea ? "area" : "format");
  }, [open, hasArea]);

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

  const runExport = async (format: ExportFormat, skipMissing: boolean): Promise<void> => {
    if (!exportFile || busy) return;
    setStatus({ kind: "busy", format });
    try {
      downloadBlob(await exportFile(format, skipMissing), `${safeFileName(fileBaseName)}.${fileExtension(format)}`);
      setStatus({ kind: "idle" });
    } catch (err) {
      if (err instanceof ExportDataError) {
        setStatus({ kind: "missing", format, messageKey: err.messageKey, retryKey: err.retryKey });
        return;
      }
      console.warn("Export failed:", err);
      setStatus({ kind: "failed" });
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1100] flex items-center ${
        area ? "justify-end bg-black/10 pr-8" : "justify-center bg-black/40 backdrop-blur-sm"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vector-export-title"
        className="w-[440px] max-w-[calc(100vw-32px)] animate-slide-up rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="vector-export-title" className="font-['Inter'] text-lg font-semibold leading-tight text-[#7a4a4a]">
            {area && step === "area" ? t("exportArea.title") : (title ?? t("export.title"))}
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

        {area && step === "area" ? (
          <AreaStep area={area} onContinue={() => setStep("format")} />
        ) : (
        <>
        {area && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[#f6f6f6] px-3 py-2 font-['Inter'] text-xs leading-[1.5]">
            <span className="font-medium text-[#333]">{t("exportArea.summary").split("{size}").join(String(area.valueM * 2))}</span>
            <button
              type="button"
              onClick={() => setStep("area")}
              disabled={busy}
              className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#7a4a4a] transition-colors hover:bg-white disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("exportArea.back")}
            </button>
          </div>
        )}

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
            description={svgDescription ?? t("export.svgDesc")}
            disabled={!exportFile || busy}
            loading={status.kind === "busy" && status.format === "svg"}
            onClick={() => void runExport("svg", false)}
          />
          <ExportOption
            icon={<Ruler className="h-5 w-5" aria-hidden="true" />}
            title={t("export.dxf")}
            description={dxfDescription ?? t("export.dxfDesc")}
            disabled={!exportFile || busy}
            loading={status.kind === "busy" && status.format === "dxf"}
            onClick={() => void runExport("dxf", false)}
          />
          {objDescription && (
            <ExportOption
              icon={<Box className="h-5 w-5" aria-hidden="true" />}
              title={t("export.obj")}
              description={objDescription}
              disabled={!exportFile || busy}
              loading={status.kind === "busy" && status.format === "obj"}
              onClick={() => void runExport("obj", false)}
            />
          )}
        </div>

        <div className="mt-4 min-h-[20px] font-['Inter'] text-xs leading-[1.5]" aria-live="polite">
          {!exportFile && <p className="text-[#828282]">{unavailableMessage ?? t("export.unavailable")}</p>}
          {exportFile && notice && status.kind === "idle" && <p className="text-[#828282]">{notice}</p>}
          {busy && <p className="text-[#828282]">{t("export.preparing")}</p>}
          {status.kind === "failed" && <p className="text-red-600">{t("export.failed")}</p>}
          {status.kind === "missing" && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <p>{t(status.messageKey)}</p>
              <button
                type="button"
                onClick={() => void runExport(status.format, true)}
                className="shrink-0 rounded-md bg-white px-2.5 py-1.5 font-medium text-[#7a4a4a] shadow-sm transition-colors hover:bg-neutral-50"
              >
                {t(status.retryKey)}
              </button>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function AreaStep({ area, onContinue }: { area: ExportAreaControl; onContinue: () => void }): JSX.Element {
  const { t } = useLanguage();
  const size = String(area.valueM * 2);
  const fill = ((area.valueM - EXPORT_AREA_MIN_M) / (EXPORT_AREA_MAX_M - EXPORT_AREA_MIN_M)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor="export-area-slider" className="font-['Inter'] text-sm font-medium text-[#333]">
          {t("exportArea.label")}
        </label>
        <span className="font-['Inter'] text-lg font-semibold tabular-nums text-[#7a4a4a]">{area.valueM} m</span>
      </div>
      <input
        id="export-area-slider"
        type="range"
        min={EXPORT_AREA_MIN_M}
        max={EXPORT_AREA_MAX_M}
        step={EXPORT_AREA_STEP_M}
        value={area.valueM}
        onChange={(e) => area.onChange(Number(e.target.value))}
        className="export-area-slider mt-3 w-full"
        style={{ background: `linear-gradient(to right, #7a4a4a ${fill}%, #e5e5e5 ${fill}%)` }}
      />
      <div className="mt-1 flex justify-between font-['Inter'] text-[11px] leading-[1.5] text-[#828282]">
        <span>{EXPORT_AREA_MIN_M} m</span>
        <span>{EXPORT_AREA_MAX_M} m</span>
      </div>
      <p className="mt-3 font-['Inter'] text-sm font-medium leading-[1.5] text-[#333]">
        {t("exportArea.covers").split("{size}").join(size)}
      </p>
      <p className="mt-1 font-['Inter'] text-xs leading-[1.5] text-[#828282]">{t("exportArea.hint")}</p>
      {area.slowAboveM !== undefined && area.valueM > area.slowAboveM && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-['Inter'] text-xs leading-[1.5] text-amber-800">
          {t("exportArea.slow")}
        </p>
      )}
      <Button
        type="button"
        onClick={onContinue}
        className="mt-5 h-11 w-full rounded-xl bg-[#7a4a4a] font-['Inter'] text-sm font-semibold text-white transition-colors hover:bg-[#6a3d3d]"
      >
        {t("exportArea.continue")}
      </Button>
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

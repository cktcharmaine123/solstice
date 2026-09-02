import { ArrowLeft, BarChart, Download, Home, Leaf, Settings as Gear } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { getSavedGraphs, type SavedGraph } from "../../utils/savedGraphs";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";

const navigationItems: { labelKey: TranslationKey; Icon: typeof Home; path: string }[] = [
  { labelKey: "nav.home", Icon: Home, path: "/home" },
  { labelKey: "nav.locations", Icon: Leaf, path: "/locations" },
  { labelKey: "nav.graphs", Icon: BarChart, path: "/graphs" },
  { labelKey: "nav.settings", Icon: Gear, path: "/settings" },
];

export const GraphDetailScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { graphId } = useParams<{ graphId: string }>();
  const [graph, setGraph] = useState<SavedGraph | null>(null);

  useEffect(() => {
    setGraph(getSavedGraphs().find((savedGraph) => savedGraph.id === graphId) ?? null);
  }, [graphId]);

  const downloadGraph = async (): Promise<void> => {
    if (!graph) return;

    const fileName = `${graph.name}.png`;

    try {
      const res = await fetch(graph.imageData);
      const blob = await res.blob();

      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: graph.name });
        return;
      }
    } catch {
      // fall through to blob download
    }

    try {
      const res = await fetch(graph.imageData);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(graph.imageData, "_blank");
    }
  };

  return (
    <main className="app-container mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-white">
      <header className="flex h-[88px] items-start justify-between px-6 pt-[47px]" aria-label="Saved graph controls">
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate("/graphs")}
          aria-label={t("graphDetail.backToGraphs")}
          className="h-12 w-12 rounded-full p-0 text-black hover:bg-neutral-100"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void downloadGraph()}
          aria-label={t("graphDetail.download")}
          disabled={!graph}
          className="h-12 w-12 rounded-full p-0 text-black hover:bg-neutral-100"
        >
          <Download className="h-6 w-6" aria-hidden="true" />
        </Button>
      </header>

      <section className="mt-[132px] flex h-[447px] w-full items-center justify-center overflow-hidden bg-[#eef2f4]" aria-label={graph ? graph.name : "Saved graph"}>
        {graph ? (
          <img src={graph.imageData} alt={`${graph.name} saved sun path`} className="h-full w-full object-cover" />
        ) : (
          <p className="px-8 text-center font-['Inter'] text-sm text-[#828282]">{t("graphDetail.notAvailable")}</p>
        )}
      </section>

      <nav className="relative z-[1000] mt-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] backdrop-blur-[10px]" aria-label="Primary navigation">
        <div className="grid h-[49px] grid-cols-4">
          {navigationItems.map(({ labelKey, Icon, path }) => (
            <Button
              key={labelKey}
              type="button"
              variant="ghost"
              onClick={() => path && navigate(path)}
              aria-current={labelKey === "nav.graphs" ? "page" : undefined}
              className={`h-[49px] flex-col justify-start rounded-none px-0 pt-[7px] hover:bg-transparent ${labelKey === "nav.graphs" ? "text-[#7a4a4a80]" : "text-[#7a4a4a]"}`}
            >
              <Icon className="h-[25px] w-[25px]" aria-hidden="true" />
              <span className="mt-0.5 [font-family:'Adamina',Helvetica] text-[10px] font-normal leading-[normal] tracking-[-0.24px]">{t(labelKey)}</span>
            </Button>
          ))}
        </div>
        <div className="h-[34px]" />
      </nav>
    </main>
  );
};

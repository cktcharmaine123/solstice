import { BarChart, Check, Home, Leaf, Pencil, SearchIcon, Settings as Gear, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { deleteGraph, getSavedGraphs, renameGraph, type SavedGraph } from "../../utils/savedGraphs";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";

const navigationItems: { labelKey: TranslationKey; Icon: typeof Home; path: string }[] = [
  { labelKey: "nav.home", Icon: Home, path: "/home" },
  { labelKey: "nav.locations", Icon: Leaf, path: "/locations" },
  { labelKey: "nav.graphs", Icon: BarChart, path: "/graphs" },
  { labelKey: "nav.settings", Icon: Gear, path: "/settings" },
];

export const GraphsScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [graphs, setGraphs] = useState<SavedGraph[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const load = () => setGraphs(getSavedGraphs());
    load();
    window.addEventListener("saved-graphs-changed", load);
    return () => window.removeEventListener("saved-graphs-changed", load);
  }, []);

  const filteredGraphs = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return graphs;
    return graphs.filter((graph) => graph.name.toLowerCase().includes(query));
  }, [graphs, searchValue]);

  const startRename = (graph: SavedGraph): void => {
    setEditingId(graph.id);
    setEditValue(graph.name);
  };

  const cancelRename = (): void => {
    setEditingId(null);
    setEditValue("");
  };

  const confirmRename = (id: string): void => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    renameGraph(id, trimmed);
    setEditingId(null);
    setEditValue("");
  };

  const handleDelete = (id: string): void => {
    deleteGraph(id);
  };

  return (
    <main className="app-container mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-auto bg-white">
      <section className="mx-7 mt-[63px]" aria-label="Saved graphs search">
        <div className="relative flex h-10 w-full items-center">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 h-6 w-6 text-[#828282]" />
          <Input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("graphs.searchPlaceholder")}
            aria-label={t("graphs.searchPlaceholder")}
            className="h-10 rounded-lg border-0 bg-neutral-100 py-2 pl-12 pr-4 font-presets-body2 text-[length:var(--presets-body2-font-size)] font-[number:var(--presets-body2-font-weight)] leading-[var(--presets-body2-line-height)] tracking-[var(--presets-body2-letter-spacing)] text-black placeholder:text-[#828282] focus-visible:ring-0"
          />
        </div>
      </section>

      <section className="mx-7 mt-[17px]" aria-labelledby="saved-graphs-title">
        <h1 id="saved-graphs-title" className="pb-2 pl-4 [font-family:'Adamina',Helvetica] text-xs font-normal leading-4 text-[#828282]">
          {t("graphs.savedGraphs")}
        </h1>
        {filteredGraphs.length === 0 ? (
          <p className="px-4 py-3 font-['Inter'] text-sm text-[#828282]">{t("graphs.empty")}</p>
        ) : (
          <ul>
            {filteredGraphs.map((graph, index) => (
              <li key={graph.id} className={`flex min-w-max items-center ${index < filteredGraphs.length - 1 ? "border-b-[0.5px] border-[#3c3c435c]" : ""}`}>
                {editingId === graph.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename(graph.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-auto flex-1 rounded-none border-0 px-4 py-[11px] text-left [font-family:'Adamina',Helvetica] text-[17px] font-normal leading-[22px] tracking-[-0.41px] text-[#1d1d1f] focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("graphs.confirmRename")}
                      onClick={() => confirmRename(graph.id)}
                      className="h-12 w-12 shrink-0 rounded-full p-0 text-[#34c759] hover:bg-neutral-100"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("graphs.cancelRename")}
                      onClick={cancelRename}
                      className="mr-4 h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate(`/graph/${graph.id}`)}
                      className="h-auto flex flex-1 items-center gap-3 rounded-none px-4 py-[11px] text-left hover:bg-neutral-100"
                    >
                      <img
                        src={graph.imageData}
                        alt={graph.name}
                        className="h-12 w-16 shrink-0 rounded-md border border-[#eee] object-cover"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate [font-family:'Adamina',Helvetica] text-[17px] font-normal leading-[22px] tracking-[-0.41px] text-[#1d1d1f]">{graph.name}</span>
                        <span className="truncate font-['Inter'] text-xs text-[#828282]">{graph.locationLabel} - {graph.dateLabel}</span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Rename ${graph.name}`}
                      onClick={() => startRename(graph)}
                      className="h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100 hover:text-[#1d1d1f]"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Delete ${graph.name}`}
                      onClick={() => handleDelete(graph.id)}
                      className="mr-4 h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100 hover:text-[#1d1d1f]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="relative z-[1000] mt-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] backdrop-blur-[10px]" aria-label="Primary navigation">
        <div className="grid h-[49px] grid-cols-4">
          {navigationItems.map(({ labelKey, Icon, path }) => {
            const isCurrent = labelKey === "nav.graphs";
            return (
            <Button
              key={labelKey}
              type="button"
              variant="ghost"
              disabled={isCurrent}
              onClick={() => path && navigate(path)}
              aria-current={isCurrent ? "page" : undefined}
              className="h-[49px] flex-col justify-start rounded-none px-0 pt-[7px] text-[#7a4a4a] hover:bg-transparent hover:text-[#7a4a4a] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#7a4a4a]"
            >
              <Icon className="h-[25px] w-[25px]" aria-hidden="true" />
              <span className="mt-0.5 [font-family:'Adamina',Helvetica] text-[10px] font-normal leading-[normal] tracking-[-0.24px]">{t(labelKey)}</span>
            </Button>
            );
          })}
        </div>
        <div className="h-[34px]" />
      </nav>
    </main>
  );
};

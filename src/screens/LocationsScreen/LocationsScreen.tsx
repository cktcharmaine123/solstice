import { BarChart, Check, Settings as Gear, Home, Leaf, Pencil, SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";
import { clearPendingAnalysisState, clearPendingRevert, peekPendingRevert, type RevertInfo } from "../../utils/revertStore";

type SavedLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

const navigationItems: { labelKey: TranslationKey; Icon: typeof Home; path: string }[] = [
  { labelKey: "nav.home", Icon: Home, path: "/home" },
  { labelKey: "nav.locations", Icon: Leaf, path: "/locations" },
  { labelKey: "nav.graphs", Icon: BarChart, path: "/graphs" },
  { labelKey: "nav.settings", Icon: Gear, path: "/settings" },
];

export const LocationsScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const hasRevert = (location.state as { hasRevert?: boolean } | null)?.hasRevert === true;
  const [revertInfo, setRevertInfo] = useState<RevertInfo | null>(
    hasRevert ? peekPendingRevert() : null,
  );
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    if (!hasRevert) return;
    return () => {
      clearPendingRevert();
      clearPendingAnalysisState();
    };
  }, [hasRevert]);

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadLocations = async (): Promise<void> => {
      const { data, error } = await supabase
        .from("saved_locations")
        .select("id, name, latitude, longitude")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(t("locations.loadError"));
      } else {
        setLocations((data ?? []) as SavedLocation[]);
      }
      setIsLoading(false);
    };
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleRemove = async (id: string): Promise<void> => {
    if (removingId) return;
    setRemovingId(id);
    const { error } = await supabase.from("saved_locations").delete().eq("id", id);
    setRemovingId(null);
    if (error) return;
    setLocations((prev) => prev.filter((location) => location.id !== id));
  };

  const startRename = (location: SavedLocation): void => {
    setEditingId(location.id);
    setEditValue(location.name);
    setRenameError(null);
  };

  const cancelRename = (): void => {
    setEditingId(null);
    setEditValue("");
    setRenameError(null);
  };

  const confirmRename = async (id: string): Promise<void> => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setRenameError(t("locations.nameEmpty"));
      return;
    }
    setSavingId(id);
    setRenameError(null);
    const { error } = await supabase
      .from("saved_locations")
      .update({ name: trimmed })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      setRenameError(t("locations.renameError"));
      return;
    }
    setLocations((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, name: trimmed } : loc)),
    );
    setEditingId(null);
    setEditValue("");
  };

  const filteredLocations = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return locations;
    return locations.filter((location) => location.name.toLowerCase().includes(query));
  }, [locations, searchValue]);

  const handleRevert = async (): Promise<void> => {
    if (!revertInfo || reverting) return;
    setReverting(true);
    await revertInfo.undo();
    clearPendingRevert();
    setReverting(false);
    navigate(revertInfo.returnTo);
  };

  return (
    <main className="app-container mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-auto bg-white">
      {revertInfo && (
        <div className="mx-7 mt-3 flex items-center gap-2 rounded-lg bg-[#7a4a4a] px-3 py-2 shadow-sm">
          <span className="flex-1 font-['Inter'] text-xs text-white">{revertInfo.message}</span>
          <button
            type="button"
            onClick={() => void handleRevert()}
            disabled={reverting}
            className="min-h-12 rounded-md bg-white/20 px-3 py-2 font-['Inter'] text-xs text-white hover:bg-white/30 disabled:opacity-40"
          >
            {t("analysis.revert")}
          </button>
        </div>
      )}

      <section className="mx-7 mt-[63px]" aria-label="Saved location search">
        <div className="relative flex h-10 w-full items-center">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 h-6 w-6 text-[#828282]" />
          <Input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("locations.searchPlaceholder")}
            aria-label={t("locations.searchPlaceholder")}
            className="h-10 rounded-lg border-0 bg-neutral-100 py-2 pl-12 pr-4 font-presets-body2 text-[length:var(--presets-body2-font-size)] font-[number:var(--presets-body2-font-weight)] leading-[var(--presets-body2-line-height)] tracking-[var(--presets-body2-letter-spacing)] text-black placeholder:text-[#828282] focus-visible:ring-0"
          />
        </div>
      </section>

      <section className="mx-7 mt-[17px]" aria-labelledby="saved-locations-title">
        <h1 id="saved-locations-title" className="pb-2 pl-4 [font-family:'Adamina',Helvetica] text-xs font-normal leading-4 text-[#828282]">
          {t("locations.savedLocations")}
        </h1>
        {isLoading ? (
          <p className="px-4 py-3 font-['Inter'] text-sm text-[#828282]">{t("locations.loading")}</p>
        ) : loadError ? (
          <p className="px-4 py-3 font-['Inter'] text-sm text-red-600">{loadError}</p>
        ) : filteredLocations.length === 0 ? (
          <p className="px-4 py-3 font-['Inter'] text-sm text-[#828282]">{t("locations.empty")}</p>
        ) : (
          <ul>
            {filteredLocations.map((location, index) => (
              <li key={location.id} className={`flex min-w-max items-center ${index < filteredLocations.length - 1 ? "border-b-[0.5px] border-[#3c3c435c]" : ""}`}>
                {editingId === location.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmRename(location.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-auto flex-1 rounded-none border-0 px-4 py-[11px] text-left [font-family:'Adamina',Helvetica] text-[17px] font-normal leading-[22px] tracking-[-0.41px] text-[#1d1d1f] focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Confirm rename"
                      onClick={() => void confirmRename(location.id)}
                      disabled={savingId === location.id}
                      className="h-12 w-12 shrink-0 rounded-full p-0 text-[#34c759] hover:bg-neutral-100 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Cancel rename"
                      onClick={cancelRename}
                      disabled={savingId === location.id}
                      className="mr-4 h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => navigate(`/analysis?location=${encodeURIComponent(location.name)}&lat=${location.latitude}&lng=${location.longitude}`)}
                      className="h-auto flex-1 justify-start rounded-none px-4 py-[11px] text-left [font-family:'Adamina',Helvetica] text-[17px] font-normal leading-[22px] tracking-[-0.41px] text-[#1d1d1f] hover:bg-neutral-100 hover:text-[#1d1d1f]"
                    >
                      {location.name}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Rename ${location.name}`}
                      onClick={() => startRename(location)}
                      className="h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100 hover:text-[#1d1d1f]"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove ${location.name}`}
                      onClick={() => void handleRemove(location.id)}
                      disabled={removingId === location.id}
                      className="mr-4 h-12 w-12 shrink-0 rounded-full p-0 text-[#828282] hover:bg-neutral-100 hover:text-[#1d1d1f] disabled:opacity-40"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            ))}
            {renameError && (
              <p className="px-4 py-2 font-['Inter'] text-sm text-red-600">{renameError}</p>
            )}
          </ul>
        )}
      </section>

      <nav className="relative z-[1000] mt-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] backdrop-blur-[10px]" aria-label="Primary navigation">
        <div className="grid h-[49px] grid-cols-4">
          {navigationItems.map(({ labelKey, Icon, path }) => {
            const isCurrent = labelKey === "nav.locations";
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

import { useEffect, useState } from "react";
import {
  calculate3DHeatmap,
  queryNearbyBuildings,
} from "./calculator";
import type {
  SurfacePatch,
  FocusedBuilding,
} from "./types";

export type UseHeatmapResult = {
  heatmapPatches: SurfacePatch[];
  analyzing: boolean;
  clearHeatmap: () => void;
};

export function useHeatmap(
  focusedBuilding: FocusedBuilding,
  selectedDate: Date,
  hasCoords: boolean,
  mapRef: React.MutableRefObject<any>,
): UseHeatmapResult {
  const [heatmapPatches, setHeatmapPatches] = useState<SurfacePatch[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!focusedBuilding || !hasCoords) {
      setHeatmapPatches([]);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const map = mapRef.current;
    const calc = () => {
      const nearbyBuildings = queryNearbyBuildings(
        map,
        focusedBuilding!.lng,
        focusedBuilding!.lat,
      );

      const result = calculate3DHeatmap(
        focusedBuilding!.geometry,
        focusedBuilding!.height,
        focusedBuilding!.baseHeight,
        focusedBuilding!.lng,
        focusedBuilding!.lat,
        selectedDate,
        nearbyBuildings,
      );
      setHeatmapPatches(result.patches);
      setAnalyzing(false);
    };
    const timer = setTimeout(calc, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedBuilding, selectedDate, hasCoords]);

  const clearHeatmap = () => {
    setHeatmapPatches([]);
  };

  return { heatmapPatches, analyzing, clearHeatmap };
}

import type { SurfacePatch } from "./types";

const HEATMAP_SOURCE = "heatmap-3d-source";
const HEATMAP_LAYER = "heatmap-3d-layer";
const HOVER_SOURCE = "hover-building-source";
const HOVER_LAYER = "hover-building-highlight";

export function renderHeatmapLayers(map: any, heatmapPatches: SurfacePatch[]): void {
  removeHeatmapLayers(map);
  if (heatmapPatches.length > 0) addHeatmapLayer(map, heatmapPatches);
}

function removeHeatmapLayers(map: any): void {
  if (map.getLayer(HEATMAP_LAYER)) {
    try { map.removeLayer(HEATMAP_LAYER); } catch (e) { /* ignore */ }
  }
  if (map.getSource(HEATMAP_SOURCE)) {
    try { map.removeSource(HEATMAP_SOURCE); } catch (e) { /* ignore */ }
  }
}

function addHeatmapLayer(map: any, heatmapPatches: SurfacePatch[]): void {
  try {
    const features = heatmapPatches.map((patch) => ({
      type: "Feature",
      geometry: patch.geometry,
      properties: {
        color: patch.color,
        baseHeight: patch.baseHeight,
        topHeight: patch.topHeight,
        hours: patch.hours,
      },
    }));

    map.addSource(HEATMAP_SOURCE, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    map.addLayer({
      id: HEATMAP_LAYER,
      source: HEATMAP_SOURCE,
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-height": ["get", "topHeight"],
        "fill-extrusion-base": ["get", "baseHeight"],
        "fill-extrusion-opacity": 1,
      },
    });
  } catch (e) {
    console.warn("Failed to add heatmap layer:", e);
  }
}

export function setHoverHighlight(map: any, geometry: any): void {
  removeHoverHighlight(map);
  if (!geometry) return;
  try {
    map.addSource(HOVER_SOURCE, {
      type: "geojson",
      data: { type: "Feature", geometry, properties: {} },
    });
    map.addLayer({
      id: HOVER_LAYER,
      source: HOVER_SOURCE,
      type: "fill",
      minzoom: 14,
      paint: {
        "fill-color": "#7a4a4a",
        "fill-opacity": 0.3,
      },
    });
  } catch (e) {
    console.warn("Failed to add hover highlight:", e);
  }
}

export function removeHoverHighlight(map: any): void {
  if (map.getLayer && map.getLayer(HOVER_LAYER)) {
    try { map.removeLayer(HOVER_LAYER); } catch (e) { /* ignore */ }
  }
  if (map.getSource && map.getSource(HOVER_SOURCE)) {
    try { map.removeSource(HOVER_SOURCE); } catch (e) { /* ignore */ }
  }
}

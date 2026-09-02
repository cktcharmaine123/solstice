import type { SurfacePatch, FocusedBuilding } from "./types";

const HEATMAP_SOURCE = "heatmap-3d-source";
const HEATMAP_LAYER = "heatmap-3d-layer";
const HIGHLIGHT_SOURCE = "focused-building-source";
const HIGHLIGHT_LAYER = "focused-building-highlight";
const HOVER_SOURCE = "hover-building-source";
const HOVER_LAYER = "hover-building-highlight";

export function renderHeatmapLayers(
  map: any,
  focusedBuilding: FocusedBuilding,
  heatmapPatches: SurfacePatch[],
): void {
  removeHeatmapLayers(map);

  if (focusedBuilding && focusedBuilding.geometry) {
    addHighlightLayer(map, focusedBuilding);

    if (heatmapPatches.length > 0) {
      addHeatmapLayer(map, heatmapPatches);
    }
  }

  try {
    map.setPaintProperty("3d-buildings", "fill-extrusion-color", "#d4d4d4");
  } catch (e) {
    console.warn("Failed to reset building color:", e);
  }
}

function removeHeatmapLayers(map: any): void {
  if (map.getLayer(HEATMAP_LAYER)) {
    try { map.removeLayer(HEATMAP_LAYER); } catch (e) { /* ignore */ }
  }
  if (map.getSource(HEATMAP_SOURCE)) {
    try { map.removeSource(HEATMAP_SOURCE); } catch (e) { /* ignore */ }
  }
  if (map.getLayer(HIGHLIGHT_LAYER)) {
    try { map.removeLayer(HIGHLIGHT_LAYER); } catch (e) { /* ignore */ }
  }
  if (map.getSource(HIGHLIGHT_SOURCE)) {
    try { map.removeSource(HIGHLIGHT_SOURCE); } catch (e) { /* ignore */ }
  }
}

function addHighlightLayer(map: any, focusedBuilding: NonNullable<FocusedBuilding>): void {
  try {
    map.addSource(HIGHLIGHT_SOURCE, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: focusedBuilding.geometry,
        properties: {},
      },
    });
    map.addLayer({
      id: HIGHLIGHT_LAYER,
      source: HIGHLIGHT_SOURCE,
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#a8a8a8",
        "fill-extrusion-height": focusedBuilding.height,
        "fill-extrusion-base": focusedBuilding.baseHeight,
        "fill-extrusion-opacity": 0.3,
      },
    });
  } catch (e) {
    console.warn("Failed to add building highlight:", e);
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
        "fill-extrusion-opacity": 0.75,
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

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { fetchHkTileBuildings } from "../../utils/vectorExport/hkBuildings";
import { MAP_TILE_ZOOM } from "../../utils/vectorExport/mapData";

const MIN_ZOOM = 15;
const MAX_TILES = 12;
// Between the street map and the sun path drawings.
const PANE = "hk-buildings";
const STYLE: L.PathOptions = { color: "#8c8279", weight: 0.7, fillColor: "#d9d2ca", fillOpacity: 0.6, interactive: false };

function visibleTiles(bounds: L.LatLngBounds): { x: number; y: number }[] {
  const n = 2 ** MAP_TILE_ZOOM;
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const out: { x: number; y: number }[] = [];
  for (let x = tx(bounds.getWest()); x <= tx(bounds.getEast()); x++) {
    for (let y = ty(bounds.getNorth()); y <= ty(bounds.getSouth()); y++) out.push({ x, y });
  }
  return out;
}

/** Draws the Lands Department building outlines over the visible part of the map. */
export function HkBuildingsLayer({ onFailure }: { onFailure: () => void }): null {
  const map = useMap();
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  useEffect(() => {
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    const renderer = L.canvas({ padding: 0.5, pane: PANE });
    const layer = L.geoJSON(undefined, { style: () => STYLE, renderer, pane: PANE } as L.GeoJSONOptions).addTo(map);
    let generation = 0;
    let shownKey = "";

    const update = () => {
      const tiles = map.getZoom() >= MIN_ZOOM ? visibleTiles(map.getBounds()) : [];
      if (tiles.length > MAX_TILES) return;
      const key = tiles.map((t) => `${t.x}/${t.y}`).join(",");
      if (key === shownKey) return;
      const current = ++generation;
      Promise.allSettled(tiles.map((t) => fetchHkTileBuildings(t.x, t.y))).then((results) => {
        if (current !== generation) return;
        shownKey = key;
        const seen = new Set<number>();
        const features: GeoJSON.Feature[] = [];
        for (const r of results) {
          if (r.status === "rejected") {
            onFailureRef.current();
            shownKey = "";
            continue;
          }
          for (const f of r.value.features) {
            if (f.id !== undefined) {
              if (seen.has(f.id)) continue;
              seen.add(f.id);
            }
            features.push({ type: "Feature", geometry: f.geometry, properties: {} });
          }
        }
        layer.clearLayers();
        layer.addData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);
      });
    };

    update();
    map.on("moveend", update);
    return () => {
      generation++;
      map.off("moveend", update);
      layer.remove();
    };
  }, [map]);

  return null;
}

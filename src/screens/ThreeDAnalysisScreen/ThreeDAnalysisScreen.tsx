import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon, CalendarDaysIcon, Clock3Icon, RefreshCwIcon, XIcon, Building2Icon } from "lucide-react";
import * as SunCalc from "suncalc";
import lookupTimezone from "tz-lookup";
import { Button } from "../../components/ui/button";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";
import {
  calculate3DHeatmap,
  buildingCentroid,
  deduplicateFeatures,
  queryNearbyBuildings,
  renderHeatmapLayers,
  setHoverHighlight,
  removeHoverHighlight,
  METERS_PER_DEG,
  AVG_BUILDING_HEIGHT_M,
  type SurfacePatch,
  type FocusedBuilding,
} from "../../utils/heatmap3d";
import {
  isValidDate,
  toDateInputValue,
  parseDateInput,
  formatShortDate,
  formatClock,
  toTimeInputValue,
  timeInputToSlider,
  azimuthToCompass,
  getSunTimes,
  sunPosition3D,
  getSelectedDateTime,
  SLIDER_MIN,
  SLIDER_MAX,
  type SunTimes,
} from "../../utils/sunCalculations";

declare global {
  interface Window {
    maplibregl: any;
  }
}

const DEFAULT_CENTER: [number, number] = [114.16, 22.28];
const DEFAULT_ZOOM = 16;
const DEFAULT_PITCH = 60;
const SUN_GROUND_DIST_M = 250;

type SelectionMode = "idle" | "to2d" | "selecting" | "to3d";

type SeasonalPreset = {
  labelKey: TranslationKey;
  month: number;
  day: number;
  color: string;
};

const SEASONAL_PRESETS: SeasonalPreset[] = [
  { labelKey: "analysis.summerSolstice" as TranslationKey, month: 6, day: 21, color: "#F97316" },
  { labelKey: "analysis.winterSolstice" as TranslationKey, month: 12, day: 21, color: "#3B82F6" },
  { labelKey: "analysis.equinox" as TranslationKey, month: 3, day: 21, color: "#F59E0B" },
];

export function ThreeDAnalysisScreen(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionModeRef = useRef<SelectionMode>("idle");
  const savedCameraRef = useRef<{ pitch: number; zoom: number; center: [number, number]; bearing: number } | null>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const [searchParams] = useSearchParams();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [debugInfo, setDebugInfo] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<number>(50);
  const [viewVersion, setViewVersion] = useState(0);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("idle");
  const [selectionMessage, setSelectionMessage] = useState("");
  const [focusedBuilding, setFocusedBuilding] = useState<FocusedBuilding>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [heatmapPatches, setHeatmapPatches] = useState<SurfacePatch[]>([]);

  const rawLat = searchParams.get("lat") ?? sessionStorage.getItem("siteLat");
  const rawLng = searchParams.get("lng") ?? sessionStorage.getItem("siteLng");

  const lat = rawLat !== null && rawLat !== "undefined" ? Number(rawLat) : NaN;
  const lng = rawLng !== null && rawLng !== "undefined" ? Number(rawLng) : NaN;

  const hasCoords =
    !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const center: [number, number] = hasCoords ? [lng, lat] : DEFAULT_CENTER;

  const locationTimeZone = useMemo<string | undefined>(() => {
    if (!hasCoords) return undefined;
    try {
      return lookupTimezone(lat, lng) ?? undefined;
    } catch {
      return undefined;
    }
  }, [lat, lng, hasCoords]);

  const sunTimes = useMemo<SunTimes>(() => {
    if (!hasCoords) return null;
    return getSunTimes(selectedDate, lat, lng);
  }, [selectedDate, lat, lng, hasCoords]);

  const selectedDateTime = useMemo(() => {
    return getSelectedDateTime(sunTimes, selectedTime);
  }, [selectedTime, sunTimes]);

  const sunPosition = useMemo(() => {
    if (!hasCoords) return null;
    return sunPosition3D(selectedDateTime, lat, lng);
  }, [selectedDateTime, lat, lng, hasCoords]);

  const displayAltitude = sunPosition ? Math.max(0, Math.round(sunPosition.altitude)) : 0;
  const displayAzimuth = sunPosition ? Math.round(((sunPosition.azimuth + 360) % 360) * 10) / 10 : 0;
  const sunVisible = sunPosition ? sunPosition.altitude > 0 : false;

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  // Handle camera transitions for 2D selection mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (selectionMode === "to2d") {
      savedCameraRef.current = {
        pitch: map.getPitch(),
        zoom: map.getZoom(),
        center: [map.getCenter().lng, map.getCenter().lat],
        bearing: map.getBearing(),
      };
      map.once("moveend", () => {
        if (selectionModeRef.current === "to2d") setSelectionMode("selecting");
      });
      map.easeTo({
        pitch: 0,
        zoom: Math.max(14, map.getZoom() - 1),
        duration: 800,
        essential: true,
      });
    } else if (selectionMode === "to3d") {
      removeHoverHighlight(map);
      const targetCenter: [number, number] = focusedBuilding
        ? [focusedBuilding.lng, focusedBuilding.lat]
        : (savedCameraRef.current?.center ?? center);
      const targetZoom = focusedBuilding
        ? 17
        : (savedCameraRef.current?.zoom ?? DEFAULT_ZOOM);
      map.once("moveend", () => {
        if (selectionModeRef.current === "to3d") setSelectionMode("idle");
      });
      map.easeTo({
        pitch: DEFAULT_PITCH,
        zoom: targetZoom,
        center: targetCenter,
        bearing: savedCameraRef.current?.bearing ?? 0,
        duration: 800,
        essential: true,
      });
    }
  }, [selectionMode, mapReady, focusedBuilding, center]);

  useEffect(() => {
    if (!containerRef.current) {
      setDebugInfo("Container not found");
      return;
    }

    containerRef.current.innerHTML = "";
    let cancelled = false;
    let map: any = null;

    const loadMapLibre = async () => {
      try {
        setDebugInfo("Loading MapLibre GL...");

        if (!document.querySelector('link[href*="maplibre-gl"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
          document.head.appendChild(link);
        }

        if (!window.maplibregl) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load MapLibre GL'));
            document.head.appendChild(script);
          });
        }

        const maplibregl = window.maplibregl;
        setDebugInfo("Creating map...");

        map = new maplibregl.Map({
          container: containerRef.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: center,
          zoom: DEFAULT_ZOOM,
          pitch: DEFAULT_PITCH,
          bearing: 0,
          attributionControl: false,
          antialias: true
        });

        map.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true,
            showCompass: false
          }),
          "top-right"
        );

        map.once("style.load", () => {
          if (cancelled) return;
          setDebugInfo("Style loaded, applying monochrome filter...");

          try {
            const layers = map.getStyle().layers;

            const layersToRemove = layers
              .filter((layer: any) => {
                const layerId = layer.id.toLowerCase();
                const layerType = layer.type;
                const sourceLayer = layer['source-layer'] || '';

                if (layerType === 'symbol') return true;
                if (sourceLayer.includes('poi') || sourceLayer.includes('place')) return true;
                if (layerId.includes('label') || layerId.includes('name') || layerId.includes('text')) return true;
                if (sourceLayer.includes('building')) return false;

                return false;
              })
              .map((layer: any) => layer.id);

            layersToRemove.forEach((layerId: string) => {
              try {
                if (map.getLayer(layerId)) {
                  map.removeLayer(layerId);
                }
              } catch (e) {
                console.warn(`Could not remove layer ${layerId}:`, e);
              }
            });

            const remainingLayers = map.getStyle().layers;

            remainingLayers.forEach((layer: any) => {
              try {
                if (layer.type === 'fill-extrusion') return;

                if (layer.type === 'fill') {
                  const paint = layer.paint || {};
                  const fillColor = paint['fill-color'];
                  if (fillColor) {
                    map.setPaintProperty(layer.id, 'fill-color', '#e0e0e0');
                  }
                }

                if (layer.type === 'line') {
                  const paint = layer.paint || {};
                  const lineColor = paint['line-color'];
                  if (lineColor) {
                    map.setPaintProperty(layer.id, 'line-color', '#666666');
                  }
                }

              } catch (e) {
                console.warn(`Could not modify layer ${layer.id}:`, e);
              }
            });

            setDebugInfo("Applied monochrome colors to base map");

            if (!map.getLayer('building-shadows')) {
              try {
                map.addLayer({
                  'id': 'building-shadows',
                  'source': 'openmaptiles',
                  'source-layer': 'building',
                  'type': 'fill',
                  'minzoom': 14,
                  'paint': {
                    'fill-color': '#1a1a2e',
                    'fill-opacity': 0,
                    'fill-translate': [0, 0],
                    'fill-translate-anchor': 'map'
                  }
                });
              } catch (e) {
                console.warn("Failed to add building shadows:", e);
              }
            }

            if (!map.getLayer('3d-buildings')) {
              setDebugInfo("Adding 3D buildings...");

              try {
                map.addLayer({
                  'id': '3d-buildings',
                  'source': 'openmaptiles',
                  'source-layer': 'building',
                  'type': 'fill-extrusion',
                  'minzoom': 14,
                  'paint': {
                    'fill-extrusion-color': '#d4d4d4',
                    'fill-extrusion-height': [
                      'coalesce',
                      ['get', 'render_height'],
                      ['get', 'height'],
                      10
                    ],
                    'fill-extrusion-base': [
                      'coalesce',
                      ['get', 'render_min_height'],
                      ['get', 'min_height'],
                      0
                    ],
                    'fill-extrusion-opacity': 0.85
                  }
                });

                setDebugInfo("3D buildings added");
              } catch (e) {
                console.warn("Failed to add 3D buildings:", e);
                setDebugInfo("Could not add 3D buildings");
              }
            }

          } catch (e) {
            console.error("Error modifying style:", e);
            setDebugInfo(`Error modifying style: ${e}`);
          }
        });

        const timeoutId = window.setTimeout(() => {
          if (!cancelled) {
            setDebugInfo("Timeout - map failed to load");
            setMapError(true);
          }
        }, 20000);

        map.once("load", () => {
          if (cancelled) return;
          window.clearTimeout(timeoutId);
          setDebugInfo("Map loaded successfully!");
          setMapReady(true);
          mapRef.current = map;

          map.on("move", () => setViewVersion((v) => v + 1));

         map.on("click", (e: any) => {
  if (selectionModeRef.current !== "selecting") return;

  // 1. Create a 10x10px search box around the click point so clicks don't miss thin edges
  const bbox: [[number, number], [number, number]] = [
    [e.point.x - 5, e.point.y - 5],
    [e.point.x + 5, e.point.y + 5],
  ];

  const features = map.queryRenderedFeatures(bbox, {
    layers: ["3d-buildings"],
  });

  if (!features || features.length === 0) {
    setSelectionMessage(tRef.current("threed.noBuildingFound"));
    setTimeout(() => setSelectionMessage(""), 2000);
    return;
  }

  const tapLng = e.lngLat.lng;
  const tapLat = e.lngLat.lat;

  // 2. Uses the updated deduplicateFeatures logic to prioritize towers over ground podiums
  const bestFeature = deduplicateFeatures(features, tapLng, tapLat);
  if (!bestFeature) {
    setSelectionMessage(tRef.current("threed.noBuildingFound"));
    setTimeout(() => setSelectionMessage(""), 2000);
    return;
  }
            const id = bestFeature.id ?? bestFeature.properties?.id ?? bestFeature.properties?.osm_id ?? Math.random();
            const centroid = buildingCentroid(bestFeature.geometry);
            if (!centroid) return;
            const [blng, blat] = centroid;
            const height =
              bestFeature.properties?.render_height ??
              bestFeature.properties?.height ??
              AVG_BUILDING_HEIGHT_M;
            const baseHeight =
              bestFeature.properties?.render_min_height ??
              bestFeature.properties?.min_height ??
              0;
            removeHoverHighlight(map);
            setFocusedBuilding({
              id,
              lat: blat,
              lng: blng,
              height: Number(height) || AVG_BUILDING_HEIGHT_M,
              baseHeight: Number(baseHeight) || 0,
              geometry: bestFeature.geometry,
            });
            setSelectionMode("to3d");
          });

          map.on("mousemove", (e: any) => {
            if (selectionModeRef.current !== "selecting") {
              removeHoverHighlight(map);
              return;
            }
            const features = map.queryRenderedFeatures(e.point, {
              layers: ["3d-buildings"],
            });
            if (!features || features.length === 0) {
              removeHoverHighlight(map);
              return;
            }
            const bestFeature = deduplicateFeatures(features, e.lngLat.lng, e.lngLat.lat);
            if (bestFeature && bestFeature.geometry) {
              setHoverHighlight(map, bestFeature.geometry);
            } else {
              removeHoverHighlight(map);
            }
          });
        });

        map.on("error", (e: any) => {
          if (cancelled) return;
          console.error("Map error:", e);
          setDebugInfo(`Map error: ${e?.error?.message || 'Unknown error'}`);
          window.clearTimeout(timeoutId);
          setMapError(true);
        });

      } catch (error) {
        console.error("Map initialization error:", error);
        setDebugInfo(`Error: ${error instanceof Error ? error.message : String(error)}`);
        if (!cancelled) {
          setMapError(true);
        }
      }
    };

    loadMapLibre();

    return () => {
      cancelled = true;
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.warn("Error removing map:", e);
        }
        map = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], retryKey]);

  // Draw 3D sun on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;

    if (!canvas || !mapReady) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectionMode !== "idle") return;

    if (!sunPosition || !sunVisible || !hasCoords || !map) return;

    const zoom = map.getZoom();
    const pitchRad = map.getPitch() * Math.PI / 180;
    const focusLat = focusedBuilding ? focusedBuilding.lat : lat;
    const focusLng = focusedBuilding ? focusedBuilding.lng : lng;
    const focusLatRad = focusLat * Math.PI / 180;
    const pixelsPerMeter = Math.pow(2, zoom) / (156543.03392 * Math.cos(focusLatRad));

    const siteScreen = map.project([focusLng, focusLat]);
    const siteX = siteScreen.x;
    const siteY = siteScreen.y;

    const sunScreenPos = (altDeg: number, azDeg: number): { x: number; y: number } => {
      const azRad = azDeg * Math.PI / 180;
      const altRad = altDeg * Math.PI / 180;

      const dxMeters = SUN_GROUND_DIST_M * Math.sin(azRad);
      const dyMeters = SUN_GROUND_DIST_M * Math.cos(azRad);
      const groundLat = focusLat + dyMeters / METERS_PER_DEG;
      const groundLng = focusLng + dxMeters / (METERS_PER_DEG * Math.cos(focusLatRad));

      const groundScreen = map.project([groundLng, groundLat]);

      const heightMeters = SUN_GROUND_DIST_M * Math.tan(altRad);
      const heightPixels = heightMeters * pixelsPerMeter * Math.sin(pitchRad);

      return {
        x: groundScreen.x,
        y: groundScreen.y - heightPixels,
      };
    };

    const sunPos = sunScreenPos(sunPosition.altitude, sunPosition.azimuth);
    const sunX = sunPos.x;
    const sunY = sunPos.y;

    if (sunTimes && sunTimes.sunrise && sunTimes.sunset) {
      const sunriseMs = sunTimes.sunrise.getTime();
      const sunsetMs = sunTimes.sunset.getTime();

      ctx.strokeStyle = 'rgba(120, 120, 140, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();

      let isFirstPoint = true;
      for (let i = 0; i <= 80; i++) {
        const stepTime = new Date(sunriseMs + (i / 80) * (sunsetMs - sunriseMs));
        const stepPos = SunCalc.getPosition(stepTime, focusLat, focusLng);

        if (stepPos.altitude > 0) {
          const stepScreen = sunScreenPos(stepPos.altitude, stepPos.azimuth);

          if (isFirstPoint) {
            ctx.moveTo(stepScreen.x, stepScreen.y);
            isFirstPoint = false;
          } else {
            ctx.lineTo(stepScreen.x, stepScreen.y);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const glowRadius = 25;
    const glowGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowRadius);
    glowGradient.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
    glowGradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
    glowGradient.addColorStop(1, 'rgba(251, 191, 36, 0)');

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    const coreRadius = 8;
    const coreGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, coreRadius);
    coreGradient.addColorStop(0, '#ffffff');
    coreGradient.addColorStop(0.3, '#fbbf24');
    coreGradient.addColorStop(0.7, '#f59e0b');
    coreGradient.addColorStop(1, '#d97706');

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(siteX, siteY);
    ctx.lineTo(sunX, sunY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = focusedBuilding ? 'rgba(100, 100, 100, 0.5)' : 'rgba(100, 100, 100, 0.5)';
    ctx.beginPath();
    ctx.arc(siteX, siteY, focusedBuilding ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
  }, [sunPosition, sunVisible, mapReady, sunTimes, lat, lng, hasCoords, viewVersion, center[0], center[1], focusedBuilding, selectionMode]);

  // Update map lighting and building shadows based on sun position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!sunPosition || !sunVisible) {
      try {
        map.setLight({
          anchor: 'map',
          position: [1.5, 0, 85],
          intensity: 0.15,
          color: '#3a3a5a'
        });
      } catch (e) {
        console.warn('Failed to set night light:', e);
      }
      if (map.getLayer('building-shadows')) {
        try {
          map.setPaintProperty('building-shadows', 'fill-opacity', 0);
        } catch (e) {
          console.warn('Failed to hide shadows:', e);
        }
      }
      return;
    }

    const altDeg = sunPosition.altitude;
    const azDeg = sunPosition.azimuth;
    const altRad = altDeg * Math.PI / 180;
    const azRad = azDeg * Math.PI / 180;

    const polarDeg = Math.max(1, 90 - altDeg);
    const intensity = 0.35 + Math.sin(altRad) * 0.35;

    try {
      map.setLight({
        anchor: 'map',
        position: [1.5, azDeg, polarDeg],
        intensity: intensity,
        color: '#fff4e0'
      });
    } catch (e) {
      console.warn('Failed to set sun light:', e);
    }

    if (map.getLayer('building-shadows')) {
      const zoom = map.getZoom();
      const latR = lat * Math.PI / 180;
      const pxPerM = Math.pow(2, zoom) / (156543.03392 * Math.cos(latR));

      const tanAlt = Math.tan(altRad);
      const shadowMeters = tanAlt > 0.05 ? AVG_BUILDING_HEIGHT_M / tanAlt : 300;
      const shadowPixels = Math.min(80, shadowMeters * pxPerM);

      const shadowX = -Math.sin(azRad) * shadowPixels;
      const shadowY = Math.cos(azRad) * shadowPixels;

      const shadowOpacity = Math.min(0.3, 0.12 + (1 - Math.sin(altRad)) * 0.15);

      try {
        map.setPaintProperty('building-shadows', 'fill-translate', [shadowX, shadowY]);
        map.setPaintProperty('building-shadows', 'fill-opacity', shadowOpacity);
      } catch (e) {
        console.warn('Failed to update shadow:', e);
      }
    }
  }, [sunPosition, sunVisible, mapReady, lat]);

  // Calculate 3D heatmap patches (roof + walls)
  useEffect(() => {
    if (!focusedBuilding || !hasCoords) {
      setHeatmapPatches([]);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const map = mapRef.current;
    const calc = () => {
      const nearbyBuildings = queryNearbyBuildings(map, focusedBuilding);

      const result = calculate3DHeatmap(
        focusedBuilding.geometry,
        focusedBuilding.height,
        focusedBuilding.baseHeight,
        focusedBuilding.lng,
        focusedBuilding.lat,
        selectedDate,
        nearbyBuildings,
      );
      setHeatmapPatches(result.patches);
      setAnalyzing(false);
    };
    const timer = setTimeout(calc, 50);
    return () => clearTimeout(timer);
  }, [focusedBuilding, selectedDate, hasCoords]);

  // Render 3D heatmap patches as fill-extrusion layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    renderHeatmapLayers(map, focusedBuilding, heatmapPatches);
  }, [focusedBuilding, heatmapPatches, mapReady]);

  const goBack = (): void => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/analysis");
    }
  };

  const retry = (): void => {
    setMapReady(false);
    setMapError(false);
    setDebugInfo("");
    setRetryKey((k) => k + 1);
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (!event.target.value) return;
    const newDate = parseDateInput(event.target.value);
    if (!isValidDate(newDate)) return;
    const oldTime = new Date(selectedDate);
    newDate.setHours(oldTime.getHours(), oldTime.getMinutes(), 0, 0);
    setSelectedDate(newDate);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (!sunTimes) return;
    setSelectedTime(timeInputToSlider(e.target.value, sunTimes, locationTimeZone));
  };

  const clearFocus = (): void => {
    setFocusedBuilding(null);
    setHeatmapPatches([]);
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <div ref={containerRef} className={`absolute inset-0 h-full w-full ${selectionMode === "selecting" ? "cursor-crosshair" : ""}`} />
      
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 z-20 pointer-events-none"
      />

      {debugInfo && !mapReady && (
        <div className="absolute top-20 left-4 z-20 bg-white/90 p-2 text-xs text-gray-600 rounded shadow max-w-xs">
          {debugInfo}
        </div>
      )}

      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f9f9f9] font-['Inter'] text-sm text-[#828282]">
          <div className="text-center">
            <div>{t("analysis.findingLocation")}</div>
            <div className="text-xs mt-2 text-gray-400">{debugInfo || "Loading..."}</div>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#f9f9f9] px-8 text-center font-['Inter'] text-sm text-[#7a4a4a]">
          <span>Unable to load the 3D map. Please check your connection and try again.</span>
          {debugInfo && (
            <div className="text-xs text-gray-500">{debugInfo}</div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={retry}
            className="flex items-center gap-2 rounded-md border-[#e6e6e6] bg-white px-4 py-2 text-[#7a4a4a] hover:bg-neutral-50"
          >
            <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      <header className="pointer-events-none absolute left-0 top-0 z-10 flex w-full items-center justify-between px-4 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          aria-label={t("analysis.goBack")}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/90 p-0 text-black shadow-sm backdrop-blur-sm hover:bg-white"
        >
          <ArrowLeftIcon className="h-5 w-5 stroke-[2.25]" aria-hidden="true" />
        </Button>
        {mapReady && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (selectionMode === "idle") {
                setSelectionMode("to2d");
              } else if (selectionMode === "selecting") {
                setSelectionMode("to3d");
              }
            }}
            aria-label={t("threed.focusBuilding")}
            className={`pointer-events-auto flex h-12 items-center gap-1.5 rounded-full px-4 shadow-sm backdrop-blur-sm transition-colors ${
              selectionMode !== "idle"
                ? "bg-[#7a4a4a] text-white hover:bg-[#6b3f3f]"
                : "bg-white/90 text-[#7a4a4a] hover:bg-white"
            }`}
          >
            <Building2Icon className="h-5 w-5" aria-hidden="true" />
            <span className="font-['Inter'] text-sm font-medium">
              {selectionMode !== "idle" ? t("threed.cancelSelection") : t("threed.focusBuilding")}
            </span>
          </Button>
        )}
      </header>

      {mapReady && selectionMode !== "idle" && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-[#7a4a4a]/90 px-4 py-2 shadow-sm backdrop-blur-sm">
          <p className="font-['Inter'] text-sm font-medium text-white">
            {selectionMode === "to2d" || selectionMode === "to3d"
              ? t("threed.transitioning")
              : selectionMessage || t("threed.selectBuilding")}
          </p>
        </div>
      )}

      {mapReady && sunVisible && selectionMode === "idle" && (
        <div className="pointer-events-none absolute top-20 left-4 z-10 rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
          <p className="font-['Inter'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#828282]">
            {t("analysis.sunPosition")}
          </p>
          <div className="flex items-center gap-3">
            <p className="font-['Inter'] text-sm font-medium text-[#7a4a4a]">
              {displayAltitude}&deg; {t("analysis.altitude")}
            </p>
            <span className="h-4 w-px bg-[#e0e0e0]" aria-hidden="true" />
            <p className="font-['Inter'] text-sm font-medium text-[#7a4a4a]">
              {displayAzimuth}&deg; {t("analysis.azimuth")} ({azimuthToCompass(displayAzimuth)})
            </p>
          </div>
          {focusedBuilding && (
            <div className="mt-1.5 flex items-center gap-2 border-t border-[#e0e0e0] pt-1.5">
              {analyzing && (
                <p className="font-['Inter'] text-sm font-medium text-[#7a4a4a]">
                  {t("threed.analyzing")}
                </p>
              )}
              <button
                type="button"
                onClick={clearFocus}
                className="pointer-events-auto ml-auto flex items-center gap-1 rounded-full bg-[#f0f0f0] px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#7a4a4a] hover:bg-[#e8e8e8]"
                aria-label={t("threed.clearFocus")}
              >
                <XIcon className="h-3 w-3" aria-hidden="true" />
                {t("threed.clearFocus")}
              </button>
            </div>
          )}
        </div>
      )}

      {mapReady && focusedBuilding && selectionMode === "idle" && (
        <div className="pointer-events-none absolute top-20 right-4 z-10 rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
          <p className="mb-1 font-['Inter'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#828282]">
            {t("threed.legend")}
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#EF4444" }} aria-hidden="true" />
              <span className="font-['Inter'] text-[11px] text-[#555]">{t("threed.legendHigh")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#FACC15" }} aria-hidden="true" />
              <span className="font-['Inter'] text-[11px] text-[#555]">{t("threed.legendMid")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#3B82F6" }} aria-hidden="true" />
              <span className="font-['Inter'] text-[11px] text-[#555]">{t("threed.legendLow")}</span>
            </div>
          </div>
        </div>
      )}

      {mapReady && selectionMode === "idle" && (
        <section
          aria-label="Sun timing and time control"
          className="absolute bottom-0 left-0 right-0 z-10 flex w-full flex-col rounded-t-md bg-[#f9f9f9f0] px-4 py-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
        >
          <div className="mb-1.5 flex gap-1.5">
            {SEASONAL_PRESETS.map((preset) => {
              const isSame =
                selectedDate.getMonth() === preset.month - 1 && selectedDate.getDate() === preset.day;
              return (
                <button
                  key={preset.labelKey}
                  type="button"
                  onClick={() => {
                      const newDate = new Date(selectedDate.getFullYear(), preset.month - 1, preset.day, 12, 0, 0, 0);
                      const oldTime = new Date(selectedDate);
                      newDate.setHours(oldTime.getHours(), oldTime.getMinutes(), 0, 0);
                      setSelectedDate(newDate);
                    }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-['Inter'] text-xs font-medium transition-colors ${
                    isSame
                      ? "border-transparent text-white"
                      : "border-[#e0e0e0] bg-white text-[#555] hover:bg-neutral-50"
                  }`}
                  style={isSame ? { backgroundColor: preset.color } : undefined}
                  aria-label={t(preset.labelKey)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: isSame ? "rgba(255,255,255,0.8)" : preset.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(preset.labelKey)}</span>
                </button>
              );
            })}
          </div>
          {sunTimes ? (
            <div className="mb-1 flex items-center justify-between font-['Inter'] text-[11px] text-[#828282]">
              <span>{t("analysis.sunrise")} {formatClock(sunTimes.sunrise, locationTimeZone)}</span>
              <span>{t("analysis.solarNoon")} {formatClock(sunTimes.noon, locationTimeZone)}</span>
              <span>{t("analysis.sunset")} {formatClock(sunTimes.sunset, locationTimeZone)}</span>
            </div>
          ) : (
            <div className="mb-1 h-[14px]" />
          )}
          <div className="flex items-center gap-2">
            <input
              aria-label={t("analysis.timeOfDay")}
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              value={selectedTime}
              onChange={(event) => setSelectedTime(Number(event.target.value))}
              className="h-8 flex-1"
              style={{ accentColor: "#7a4a4a" }}
            />
          </div>
          <div className="flex items-center gap-1.5 border-t border-[#e8e8e8] pt-1.5 font-['Inter'] text-base font-medium text-[#7a4a4a]">
            <label className="relative flex cursor-pointer items-center gap-1.5">
              <input
                type="date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={toDateInputValue(selectedDate)}
                onChange={handleDateChange}
                aria-label={t("analysis.selectDate")}
              />
              <span>{formatShortDate(selectedDate)}</span>
              <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
            </label>
            <span className="ml-auto flex items-center gap-2">
              {formatClock(selectedDateTime, locationTimeZone)}
              <label
                className="relative flex cursor-pointer items-center"
                aria-label={t("analysis.timeOfDay")}
              >
                <input
                  type="time"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={toTimeInputValue(selectedDateTime, locationTimeZone)}
                  onChange={handleTimeChange}
                  aria-label={t("analysis.timeOfDay")}
                />
                <Clock3Icon className="h-5 w-5" aria-hidden="true" />
              </label>
            </span>
          </div>
        </section>
      )}
    </main>
  );
}

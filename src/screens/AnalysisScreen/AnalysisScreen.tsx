import {
  ArrowLeftIcon,
  BarChart,
  Box,
  CalendarDaysIcon,
  Clock3Icon,
  Eye,
  EyeOff,
  Home,
  Leaf,
  PlusIcon,
  SearchIcon,
  Settings,
  Trash2,
  XIcon,
} from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import * as SunCalc from "suncalc";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet-rotate";
import { calculateSunPathData } from "../../utils/sunMath";
import "leaflet/dist/leaflet.css";
import { Button } from "../../components/ui/button";
import { toPng } from "html-to-image";
import domToImage from "dom-to-image-more";
import { supabase } from "../../lib/supabase";
import { formatGraphName, saveGraph } from "../../utils/savedGraphs";
import { peekPendingAnalysisState, setPendingAnalysisState, setPendingRevert } from "../../utils/revertStore";
import lookupTimezone from "tz-lookup";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";

const DEFAULT_ZOOM = 19;
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const PATH_STEPS = 60;
const R_MAX = 150;
const METERS_PER_DEG = 111320;
const PRIMARY_COLOR = "#7a4a4a";
const PRIMARY_PATH_COLOR = "#8B4513";
const CUSTOM_COLOR = "#14B8A6";

type Coordinates = { lat: number; lng: number };
type NominatimResult = { lat: string; lon: string; display_name: string };
type SunTimes = {
  sunrise: Date;
  sunset: Date;
  noon: Date;
} | null;
export type SunPathOverlay = {
  id: string;
  label: string;
  date: Date;
  color: string;
  selectedTime: number;
  visible: boolean;
};
type SeasonalPreset = {
  labelKey: TranslationKey;
  shortLabelKey: TranslationKey;
  month: number;
  day: number;
  color: string;
};

const SEASONAL_PRESETS: SeasonalPreset[] = [
  { labelKey: "analysis.summerSolstice" as TranslationKey, shortLabelKey: "analysis.summerShort" as TranslationKey, month: 6, day: 21, color: "#F97316" },
  { labelKey: "analysis.winterSolstice" as TranslationKey, shortLabelKey: "analysis.winterShort" as TranslationKey, month: 12, day: 21, color: "#3B82F6" },
  { labelKey: "analysis.equinox" as TranslationKey, shortLabelKey: "analysis.equinoxShort" as TranslationKey, month: 3, day: 21, color: "#F59E0B" },
];

const navigationItems: { labelKey: TranslationKey; Icon: typeof Home }[] = [
  { labelKey: "nav.home", Icon: Home },
  { labelKey: "nav.locations", Icon: Leaf },
  { labelKey: "nav.graphs", Icon: BarChart },
  { labelKey: "nav.settings", Icon: Settings },
];

function isValidCoords(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

const REDUNDANT_ADDRESS_PARTS = new Set([
  "hong kong",
  "china",
  "香港",
  "中国",
  "kowloon",
  "new territories",
]);

function shortenLocationLabel(displayName: string): string {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const lower = part.toLowerCase();
      return part.length > 0 && !REDUNDANT_ADDRESS_PARTS.has(lower);
    });

  const chosen = parts.slice(0, 3).join(", ");
  const words = chosen.split(/\s+/).filter(Boolean);
  return words.slice(0, 7).join(" ");
}

async function geocode(location: string): Promise<{ coords: Coordinates; label: string } | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&dedupe=1&q=${encodeURIComponent(location)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;
  const results = (await response.json()) as NominatimResult[];
  const result = results[0];
  if (!result) return null;
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!isValidCoords(lat, lng)) return null;
  return { coords: { lat, lng }, label: shortenLocationLabel(result.display_name) };
}

function formatClock(date: Date, timeZone?: string): string {
  if (!isValidDate(date)) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

function toTimeInputValue(date: Date, timeZone?: string): string {
  if (!isValidDate(date)) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const hh = h === "24" ? "00" : h.padStart(2, "0");
    return `${hh}:${m.padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function displayedMinutes(date: Date, timeZone?: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return 0;
  }
}

function timeInputToSlider(timeStr: string, sunTimes: SunTimes, timeZone?: string): number {
  if (!sunTimes || !timeStr) return 50;
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 50;
  const target = h * 60 + m;
  const sunriseMin = displayedMinutes(sunTimes.sunrise, timeZone);
  let sunsetMin = displayedMinutes(sunTimes.sunset, timeZone);
  if (sunsetMin <= sunriseMin) sunsetMin += 1440;
  let t = target;
  if (t < sunriseMin) t += 1440;
  const span = sunsetMin - sunriseMin;
  if (span <= 0) return 50;
  const slider = ((t - sunriseMin) / span) * 100;
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, slider));
}

function formatShortDate(date: Date): string {
  if (!isValidDate(date)) return "—";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function buildPathPoints(date: Date, center: Coordinates): [number, number][] {
  if (!isValidDate(date) || !isValidCoords(center.lat, center.lng)) return [];
  const siteLat = Number(center.lat);
  const siteLng = Number(center.lng);
  const times = SunCalc.getTimes(date, siteLat, siteLng);
  if (!isValidDate(times.sunrise) || !isValidDate(times.sunset)) return [];
  const sunriseMs = times.sunrise.getTime();
  const sunsetMs = times.sunset.getTime();
  if (sunsetMs <= sunriseMs) return [];
  const points: [number, number][] = [];
  for (let i = 0; i <= PATH_STEPS; i++) {
    const stepTime = new Date(sunriseMs + (i / PATH_STEPS) * (sunsetMs - sunriseMs));
    const pos = SunCalc.getPosition(stepTime, siteLat, siteLng);
    const azimuthRad = pos.azimuth * (Math.PI / 180);
    const dynamicR = R_MAX * (1 - (Math.max(0, pos.altitude) / 90));
    const dx = dynamicR * Math.sin(azimuthRad);
    const dy = -dynamicR * Math.cos(azimuthRad);
    const lat = siteLat + dy / METERS_PER_DEG;
    const lng = siteLng + dx / (METERS_PER_DEG * Math.cos((siteLat * Math.PI) / 180));
    points.push([lat, lng]);
  }
  return points;
}

function getSunTimes(date: Date, center: Coordinates): SunTimes {
  if (!isValidDate(date) || !isValidCoords(center.lat, center.lng)) return null;
  const times = SunCalc.getTimes(date, center.lat, center.lng);
  if (!isValidDate(times.sunrise) || !isValidDate(times.sunset)) return null;
  return { sunrise: times.sunrise, sunset: times.sunset, noon: times.solarNoon };
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function azimuthToCompass(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return COMPASS_16[idx];
}

function createSunIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "sun-path-marker",
    html: `<div class="sun-path-marker__inner"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="${color}"/><path d="M12 1.5v3M12 19.5v3M4.58 4.58l2.12 2.12M17.3 17.3l2.12 2.12M1.5 12h3M19.5 12h3M4.58 19.42l2.12-2.12M17.3 6.7l2.12-2.12" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }): null {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RightClickRotateHandler(): null {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let dragging = false;
    let startX = 0;
    let startBearing = 0;

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 2) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startBearing = map.getBearing();
      container.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const delta = e.clientX - startX;
      map.setBearing(startBearing + delta * 0.5);
    };

    const onMouseUp = (e: MouseEvent): void => {
      if (!dragging) return;
      dragging = false;
      container.style.cursor = "";
    };

    container.addEventListener("contextmenu", (e) => e.preventDefault());
    container.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [map]);

  return null;
}

function MapViewport({
  center,
  pathPoints,
}: {
  center: Coordinates;
  pathPoints: [number, number][];
}): null {
  const map = useMap();
  const lastCenterRef = useRef<Coordinates | null>(null);

  useEffect(() => {
    const delays = [0, 50, 150, 300];
    const timers = delays.map((d) =>
      window.setTimeout(() => map.invalidateSize(), d),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [map]);

  useEffect(() => {
    if (
      lastCenterRef.current &&
      lastCenterRef.current.lat === center.lat &&
      lastCenterRef.current.lng === center.lng
    ) {
      return;
    }
    lastCenterRef.current = center;

    if (pathPoints.length > 0) {
      const bounds = L.latLngBounds([
        [center.lat, center.lng],
        ...pathPoints,
      ]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
    } else {
      map.setView([center.lat, center.lng], 19);
    }
  }, [center, pathPoints, map]);
  return null;
}

function CompassControl(): null {
  const map = useMap();

  useEffect(() => {
    const container = L.DomUtil.create("div", "leaflet-compass");
    container.style.cssText = [
      "width: 52px",
      "height: 52px",
      "background: rgba(255,255,255,0.92)",
      "border: 1px solid rgba(60,60,67,0.36)",
      "border-radius: 50%",
      "box-shadow: 0 2px 6px rgba(0,0,0,0.18)",
      "backdrop-filter: blur(6px)",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "cursor: pointer",
      "margin-right: 12px",
      "margin-bottom: 12px",
      "user-select: none",
    ].join(";");

    container.innerHTML = `
      <svg viewBox="0 0 100 100" width="44" height="44" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="#d8d8d8" stroke-width="1.5"/>
        <g class="compass-dial" style="transform-origin: 50px 50px;">
          <text x="50" y="16" text-anchor="middle" font-size="11" font-family="Inter,sans-serif" font-weight="700" fill="#7a4a4a">N</text>
          <text x="50" y="90" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#9a9a9a">S</text>
          <text x="88" y="54" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#9a9a9a">E</text>
          <text x="12" y="54" text-anchor="middle" font-size="9" font-family="Inter,sans-serif" fill="#9a9a9a">W</text>
          <polygon points="50,24 46,50 50,46 54,50" fill="#ef4444"/>
          <polygon points="50,76 46,50 50,54 54,50" fill="#7a4a4a"/>
          <circle cx="50" cy="50" r="2.5" fill="#7a4a4a"/>
        </g>
      </svg>
    `;

    const dial = container.querySelector(".compass-dial") as SVGGElement | null;

    const getBearing = (): number => {
      const bearing = (map as unknown as { getBearing?: () => number }).getBearing;
      return typeof bearing === "function" ? bearing.call(map) : 0;
    };

    const updateDial = () => {
      if (dial) dial.style.transform = `rotate(${-getBearing()}deg)`;
    };

    updateDial();
    map.on("move rotate", updateDial);

    const onReset = (e: Event) => {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      const setBearing = (map as unknown as { setBearing?: (b: number) => void }).setBearing;
      if (typeof setBearing === "function") setBearing.call(map, 0);
      updateDial();
    };
    L.DomEvent.on(container, "click", onReset);

    const control = L.Control.extend({
      onAdd: () => container,
      onRemove: () => {
        map.off("move rotate", updateDial);
        L.DomEvent.off(container, "click", onReset);
      },
    });
    const instance = new (control as unknown as new (opts: object) => L.Control)({
      position: "bottomright",
    });
    map.addControl(instance);

    return () => {
      map.removeControl(instance);
    };
  }, [map]);

  return null;
}



class AnalysisErrorBoundary extends Component<{ children: ReactNode; t: (key: TranslationKey) => string }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="flex min-h-[100dvh] w-full max-w-[100vw] flex-col items-center justify-center gap-4 bg-white px-8 text-center">
          <p className="font-['Inter'] text-lg font-semibold text-[#7a4a4a]">{t("analysis.somethingWentWrong")}</p>
          <p className="font-['Inter'] text-sm text-[#828282]">{t("analysis.mapLoadError")}</p>
          <Button type="button" onClick={() => window.history.back()} className="bg-[#7a4a4a] text-white hover:bg-[#6b3f3f]">
            {t("analysis.goBack")}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingFallback({ t }: { t: (key: TranslationKey) => string }): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-neutral-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7a4a4a] border-t-transparent" />
      <p className="font-['Inter'] text-sm text-[#828282]">{t("analysis.loadingMap")}</p>
    </div>
  );
}

export const AnalysisScreen = (): JSX.Element => {
  const { t } = useLanguage();
  return (
    <AnalysisErrorBoundary t={t}>
      <AnalysisScreenContent />
    </AnalysisErrorBoundary>
  );
};

function AnalysisScreenContent(): JSX.Element {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const locationParam = searchParams.get("location")?.trim() || "";

  const hasUrlCoords = latParam !== null && lngParam !== null;
  const parsedLat = hasUrlCoords ? parseFloat(latParam) : NaN;
  const parsedLng = hasUrlCoords ? parseFloat(lngParam) : NaN;
  const urlCoordsValid = isValidCoords(parsedLat, parsedLng);

  const initialLabel = locationParam || (urlCoordsValid ? `${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}` : t("analysis.searchLocation"));

  const navigate = useNavigate();

  const handleNavigation = (labelKey: TranslationKey) => {
    if (labelKey === "nav.home") navigate("/home");
    if (labelKey === "nav.locations") navigate("/locations");
    if (labelKey === "nav.graphs") navigate("/graphs");
    if (labelKey === "nav.settings") navigate("/settings");
  };
  const [center, setCenter] = useState<Coordinates | null>(
    urlCoordsValid ? { lat: parsedLat, lng: parsedLng } : null,
  );
  const [locationLabel, setLocationLabel] = useState(initialLabel);
  const restoredState = peekPendingAnalysisState();
  const [selectedDate, setSelectedDate] = useState(() => restoredState?.selectedDate ?? new Date());
  const [selectedTime, setSelectedTime] = useState(restoredState?.selectedTime ?? 50);
  const [isLoading, setIsLoading] = useState(!urlCoordsValid);
  const [locationError, setLocationError] = useState(false);
  const [sunPaths, setSunPaths] = useState<SunPathOverlay[]>(restoredState?.sunPaths ?? []);
  const [primaryColor, setPrimaryColor] = useState<string>(restoredState?.primaryColor ?? PRIMARY_PATH_COLOR);
  const [primaryPathVisible, setPrimaryPathVisible] = useState<boolean>(restoredState?.primaryPathVisible ?? true);
  const [modalOpen, setModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(toDateInputValue(new Date()));
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const chipsRowRef = useRef<HTMLDivElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const dragState = useRef<{ active: boolean; startX: number; scrollLeft: number }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
  });

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = chipsRowRef.current;
    if (!el) return;
    dragState.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
  };

  const handleDragMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!dragState.current.active || !chipsRowRef.current) return;
    e.preventDefault();
    const el = chipsRowRef.current;
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = dragState.current.scrollLeft - (x - dragState.current.startX);
  };

  const handleDragEnd = (): void => {
    dragState.current.active = false;
  };

  const coordsReady = center !== null && isValidCoords(center.lat, center.lng);

  useEffect(() => {
    if (urlCoordsValid) return;
    let cancelled = false;
    const query = locationParam.trim();
    if (!query) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLocationError(false);
    geocode(query)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setCenter(result.coords);
          setLocationLabel(result.label);
        } else {
          setLocationError(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLocationError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (query: string): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setLocationError(false);
    try {
      const result = await geocode(trimmed);
      if (result) {
        setCenter(result.coords);
        setLocationLabel(result.label);
        setSearchValue("");
      } else {
        setLocationError(true);
      }
    } catch {
      setLocationError(true);
    } finally {
      setIsSearching(false);
    }
  };

  const sunTimes = useMemo<SunTimes>(() => {
    if (!coordsReady || !center) return null;
    return getSunTimes(selectedDate, center);
  }, [selectedDate, center, coordsReady]);

  const selectedDateTime = useMemo(() => {
    if (!sunTimes) return new Date();
    const sunriseMs = sunTimes.sunrise.getTime();
    const sunsetMs = sunTimes.sunset.getTime();
    if (sunsetMs <= sunriseMs) return sunTimes.noon;
    return new Date(sunriseMs + (selectedTime / 100) * (sunsetMs - sunriseMs));
  }, [selectedTime, sunTimes]);

  const { pathPoints, sunMarkerPos, displayAltitude, displayAzimuth, sunConePolygon } = useMemo(
    () => calculateSunPathData(selectedDate, selectedDateTime, center ?? { lat: 0, lng: 0 }),
    [selectedDate, selectedDateTime, center],
  );

  const locationTimeZone = useMemo<string | undefined>(() => {
    if (!center) return undefined;
    try {
      return lookupTimezone(center.lat, center.lng) ?? undefined;
    } catch {
      return undefined;
    }
  }, [center]);

  const overlayPaths = useMemo(() => {
    if (!coordsReady || !center) return [];
    return sunPaths.map((p) => ({ overlay: p, points: buildPathPoints(p.date, center) }));
  }, [sunPaths, center, coordsReady]);

  const overlaySunData = useMemo(() => {
    if (!coordsReady || !center) return [];
    return sunPaths.map((p) => {
      const times = getSunTimes(p.date, center);
      let currentTime = times ? times.noon : new Date();
      if (times && times.sunset.getTime() > times.sunrise.getTime()) {
        currentTime = new Date(
          times.sunrise.getTime() + (p.selectedTime / 100) * (times.sunset.getTime() - times.sunrise.getTime()),
        );
      }
      return {
        overlay: p,
        times,
        currentTime,
        ...calculateSunPathData(p.date, currentTime, center),
      };
    });
  }, [sunPaths, center, coordsReady]);

  const overlayIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    for (const p of sunPaths) {
      icons[p.id] = createSunIcon(p.color);
    }
    return icons;
  }, [sunPaths]);

  const goBack = (): void => {
    window.history.back();
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (!event.target.value) return;
    const newDate = parseDateInput(event.target.value);
    if (!isValidDate(newDate)) return;
    const oldTime = new Date(selectedDate);
    newDate.setHours(oldTime.getHours(), oldTime.getMinutes(), 0, 0);
    setSelectedDate(newDate);
  };

  const addPresetPath = (preset: SeasonalPreset): void => {
    const year = selectedDate.getFullYear();
    const date = new Date(year, preset.month - 1, preset.day, 12, 0, 0, 0);
    const id = `preset-${preset.month}-${preset.day}-${year}`;
    if (sunPaths.some((p) => p.id === id)) {
      setModalOpen(false);
      return;
    }
    setSunPaths((prev) => [...prev, { id, label: t(preset.shortLabelKey), date, color: preset.color, selectedTime: 50, visible: true }]);
    setModalOpen(false);
  };

  const addCustomPath = (): void => {
    if (!customDate) return;
    const date = parseDateInput(customDate);
    if (!isValidDate(date)) return;
    const id = `custom-${customDate}-${Date.now()}`;
    setSunPaths((prev) => [...prev, { id, label: date.toLocaleDateString([], { month: "short", day: "numeric" }), date, color: CUSTOM_COLOR, selectedTime: 50, visible: true }]);
    setModalOpen(false);
  };

  const waitForRender = useCallback(async (frames: number): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 450));
  }, []);

  const waitForMapTiles = useCallback(async (captureTarget: HTMLElement): Promise<void> => {
    const tiles = Array.from(captureTarget.querySelectorAll<HTMLImageElement>("img.leaflet-tile"));
    await Promise.all(
      tiles.map(async (tile) => {
        if (!tile.complete) {
          await new Promise<void>((resolve) => {
            const finish = (): void => {
              tile.removeEventListener("load", finish);
              tile.removeEventListener("error", finish);
              resolve();
            };
            tile.addEventListener("load", finish, { once: true });
            tile.addEventListener("error", finish, { once: true });
          });
        }
        if (tile.decode) {
          try {
            await tile.decode();
          } catch {
            // The image is still usable when the browser cannot decode it again.
          }
        }
      }),
    );
  }, []);

  const captureMap = useCallback(async (captureTarget: HTMLElement): Promise<string> => {
    const options = {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: "#eef2f4",
      bgcolor: "#eef2f4",
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await toPng(captureTarget, options);
      } catch (err) {
        if (attempt === 2) {
          return await domToImage.toPng(captureTarget, { cacheBust: false, bgcolor: "#eef2f4" });
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error("Capture failed");
  }, []);

  const handleSaveGraph = useCallback(async (): Promise<void> => {
    if (!coordsReady || !center) return;
    const target = mapSectionRef.current;
    if (!target) return;
    const mapEl = target.querySelector(".leaflet-container") as HTMLElement | null;
    const captureTarget = mapEl ?? target;

    setIsCapturing(true);
    setSaveMessage(null);

    try {
      mapInstanceRef.current?.invalidateSize({ animate: false });
      await waitForRender(4);
      mapInstanceRef.current?.invalidateSize({ animate: false });
      await waitForRender(2);
      await waitForMapTiles(captureTarget);
      const imageData = await captureMap(captureTarget);

      const now = new Date();
      const graphId = `graph-${now.getTime()}`;
      saveGraph({
        id: graphId,
        name: formatGraphName(now),
        createdAt: now.toISOString(),
        imageData,
        locationLabel,
        dateLabel: formatShortDate(selectedDate),
      });
      setPendingAnalysisState({
        sunPaths,
        selectedDate,
        selectedTime,
        primaryColor,
        primaryPathVisible,
      });
      navigate("/graphs");
    } catch {
      setSaveMessage(t("analysis.couldNotSaveGraph"));
    } finally {
      setIsCapturing(false);
    }
  }, [coordsReady, center, locationLabel, selectedDate, navigate, waitForRender, waitForMapTiles, captureMap, sunPaths, selectedTime, primaryColor, t]);

  const handleSaveLocation = async (): Promise<void> => {
    if (!coordsReady || !center || !locationLabel.trim() || isSavingLocation) return;
    setIsSavingLocation(true);
    setSaveMessage(null);
    const savedName = locationLabel.trim();
    const { error } = await supabase.from("saved_locations").upsert(
      { name: savedName, latitude: center.lat, longitude: center.lng },
      { onConflict: "name" },
    );
    setIsSavingLocation(false);
    if (error) {
      setSaveMessage(t("analysis.couldNotSaveLocation"));
      return;
    }
    setPendingRevert({
      message: t("analysis.locationSaved"),
      undo: async () => {
        await supabase.from("saved_locations").delete().eq("name", savedName);
      },
      returnTo: `/analysis?location=${encodeURIComponent(savedName)}&lat=${center.lat}&lng=${center.lng}`,
    });
    setPendingAnalysisState({
      sunPaths,
      selectedDate,
      selectedTime,
      primaryPathVisible,
    });
    navigate("/locations", { state: { hasRevert: true } });
  };

  const removePath = (id: string): void => {
    setSunPaths((prev) => prev.filter((p) => p.id !== id));
  };

  const togglePathVisibility = (id: string): void => {
    setSunPaths((prev) => prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  };

  const handleOverlayTimeChange = (id: string, time: number): void => {
    setSunPaths((prev) => prev.map((p) => (p.id === id ? { ...p, selectedTime: time } : p)));
  };

  const handleOverlayColorChange = (id: string, color: string): void => {
    setSunPaths((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (!sunTimes) return;
    setSelectedTime(timeInputToSlider(e.target.value, sunTimes, locationTimeZone));
  };

  const handleOverlayTimeInputChange = (id: string, e: React.ChangeEvent<HTMLInputElement>): void => {
    setSunPaths((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const times = getSunTimes(p.date, center ?? { lat: 0, lng: 0 });
        return { ...p, selectedTime: timeInputToSlider(e.target.value, times, locationTimeZone) };
      }),
    );
  };

  const handleMapPick = useCallback((lat: number, lng: number): void => {
    setCenter({ lat, lng });
    setLocationLabel(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  }, []);

  const markerIcon = useMemo(() => createSunIcon(primaryColor), [primaryColor]);
  const centerIcon = useMemo(
    () =>
      L.divIcon({
        className: "sun-path-center-marker",
        html: "<span></span>",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    [],
  );

  return (
    <main className="app-container relative mx-auto flex min-h-[calc(100dvh+300px)] w-full flex-col overflow-x-hidden bg-white">
      <header className="absolute left-0 top-[61px] z-30 flex w-full flex-col items-center bg-white px-4">
        <Button
          type="button"
          variant="ghost"
          aria-label={t("analysis.goBack")}
          onClick={goBack}
          className="absolute left-[15px] top-[-32px] flex h-12 w-12 items-center justify-center p-0 text-black hover:bg-transparent hover:text-black"
        >
          <ArrowLeftIcon className="h-5 w-5 stroke-[2.25]" aria-hidden="true" />
        </Button>
        <section
          aria-label="Selected location"
          className="absolute left-4 top-0 flex h-16 w-[calc(100%-32px)] items-center gap-3 rounded-xl bg-neutral-100 py-2 pl-3 pr-4"
        >
          <SearchIcon className="h-6 w-6 shrink-0 text-black" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5">
            <input
              aria-label={t("analysis.searchLocation")}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch(searchValue);
              }}
              disabled={isSearching}
              className="w-full truncate border-0 bg-transparent p-0 [font-family:'Adamina',Helvetica] text-base font-normal leading-6 text-black placeholder:text-[#828282] focus:outline-none disabled:opacity-50"
              placeholder={isLoading ? t("analysis.findingLocation") : locationLabel}
            />
            <label className="relative inline-flex cursor-pointer items-center gap-1.5 font-['Inter'] text-sm leading-[22px] text-[#828282]">
              <input
                type="date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={toDateInputValue(selectedDate)}
                onChange={handleDateChange}
                aria-label={t("analysis.selectDate")}
              />
              <time>{formatShortDate(selectedDate)}</time>
              <CalendarDaysIcon className="h-4 w-4 text-[#7a4a4a]" aria-hidden="true" />
              <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-[#00000080]" />
              <time>{formatClock(selectedDateTime, locationTimeZone)}</time>
            </label>
          </div>
        </section>
        <div className="absolute left-4 top-[78px] flex w-[calc(100%-32px)] items-center gap-[18px]">
          {["analysis.saveLocation", "analysis.saveGraph"].map((key) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              onClick={key === "analysis.saveLocation" ? () => void handleSaveLocation() : () => void handleSaveGraph()}
              disabled={key === "analysis.saveLocation" && (isSavingLocation || !coordsReady) || key === "analysis.saveGraph" && (!coordsReady || isCapturing)}
              className="min-h-12 rounded-[20px] bg-[#f6f6f6] px-4 py-3 [font-family:'Adamina',Helvetica] text-sm font-normal leading-[19.6px] text-[#7a4a4a] hover:bg-[#eeeeee] disabled:opacity-60"
            >
              {t(key as TranslationKey)}
            </Button>
          ))}
        </div>
        {saveMessage && <p className="absolute left-3 top-[114px] font-['Inter'] text-xs text-red-600">{saveMessage}</p>}
      </header>

      <div className="absolute left-0 top-[200px] z-30 flex w-full items-center gap-2 px-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setModalOpen(true)}
          disabled={isLoading}
          className="h-12 shrink-0 justify-start gap-1 rounded-md border-[#e6e6e6] bg-white px-3 py-2 shadow-none hover:bg-neutral-50"
        >
          <PlusIcon className="h-4 w-4 text-[#7a4a4a]" aria-hidden="true" />
          <span className="[font-family:'Adamina',Helvetica] text-[11px] leading-[22px] text-[#7a4a4a]">
            {t("analysis.addSunPath")}
          </span>
        </Button>
        {coordsReady && center && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              sessionStorage.setItem("siteLat", center.lat.toString());
              sessionStorage.setItem("siteLng", center.lng.toString());
              navigate(`/analysis-3d?lat=${center.lat}&lng=${center.lng}`);
            }}
            className="h-12 shrink-0 justify-start gap-1 rounded-md border-[#e6e6e6] bg-white px-3 py-2 shadow-none hover:bg-neutral-50"
          >
            <Box className="h-4 w-4 text-[#7a4a4a]" aria-hidden="true" />
            <span className="[font-family:'Adamina',Helvetica] text-[11px] leading-[22px] text-[#7a4a4a]">
              {t("analysis.threeDAnalysis")}
            </span>
            <span className="[font-family:'Adamina',Helvetica] text-[10px] leading-[22px] text-[#7a4a4a]/50">
              (developing)
            </span>
          </Button>
        )}
        {sunPaths.length > 0 && (
          <div
            ref={chipsRowRef}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            className="flex items-center gap-2 overflow-x-auto pb-1"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              maxWidth: "calc(100% - 180px)",
              WebkitOverflowScrolling: "touch",
              cursor: dragState.current.active ? "grabbing" : "grab",
              touchAction: "pan-x",
            }}
          >
            {sunPaths.map((path) => (
              <span
                key={path.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor: `${path.color}1a`,
                  color: path.color,
                  opacity: path.visible ? 1 : 0.45,
                }}
              >
                {path.label}
                <button
                  type="button"
                  onClick={() => togglePathVisibility(path.id)}
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                  aria-label={path.visible ? `Hide ${path.label}` : `Show ${path.label}`}
                  aria-pressed={!path.visible}
                >
                  {path.visible ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => removePath(path.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                  aria-label={`Remove ${path.label}`}
                >
                  <XIcon className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <section
        ref={mapSectionRef}
        aria-label="Interactive sun path map"
        className="absolute left-0 top-[251px] w-full px-4"
        style={{ height: "430px", minHeight: "430px" }}
      >
        {isLoading || !coordsReady || !center ? (
          <LoadingFallback t={t} />
        ) : (
          <>
            <MapContainer
              ref={mapInstanceRef}
              center={[center.lat, center.lng]}
              zoom={DEFAULT_ZOOM}
              zoomControl={false}
              scrollWheelZoom
              attributionControl={false}
              preferCanvas={false}
              rotate
              touchRotate
              shiftKeyRotate
              rotateControl={false}
              className="h-full w-full"
              style={{ height: "100%", width: "100%", minHeight: "430px" }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                crossOrigin="anonymous"
              />
              <MapViewport center={center} pathPoints={pathPoints} />
              <MapClickHandler onPick={handleMapPick} />
              <RightClickRotateHandler />
              <CompassControl />

              {overlayPaths.map(({ overlay, points }) =>
                points.length > 0 && overlay.visible ? (
                  <Polyline
                    key={overlay.id}
                    positions={points}
                    pathOptions={{ color: overlay.color, weight: 2.5, opacity: 0.7, dashArray: "4 6" }}
                  />
                ) : null,
              )}

              {overlaySunData.map(({ overlay, sunConePolygon }) =>
                sunConePolygon.length > 0 && overlay.visible ? (
                  <Polygon
                    key={`cone-${overlay.id}`}
                    positions={sunConePolygon}
                    pathOptions={{
                      color: "transparent",
                      fillColor: "#f59e0b",
                      fillOpacity: 0.15,
                    }}
                  />
                ) : null,
              )}

              {primaryPathVisible && pathPoints.length > 0 && (
                <Polyline
                  positions={pathPoints}
                  pathOptions={{ color: primaryColor, weight: 3, opacity: 0.9 }}
                />
              )}

              {primaryPathVisible && sunConePolygon.length > 0 && (
                <Polygon
                  positions={sunConePolygon}
                  pathOptions={{
                    color: "transparent",
                    fillColor: "#f59e0b",
                    fillOpacity: 0.15,
                  }}
                />
              )}
              {primaryPathVisible && sunMarkerPos && (
                <Marker position={sunMarkerPos} icon={markerIcon} />
              )}
              {overlaySunData.map(({ overlay, sunMarkerPos }) =>
                sunMarkerPos && overlay.visible ? (
                  <Marker
                    key={`marker-${overlay.id}`}
                    position={sunMarkerPos}
                    icon={overlayIcons[overlay.id]}
                  />
                ) : null,
              )}
              <Marker position={[center.lat, center.lng]} icon={centerIcon} />
            </MapContainer>

            {!isCapturing && primaryPathVisible && (
              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
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
              </div>
            )}
            {!isCapturing && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[500] flex justify-center">
                <p className="rounded-full bg-[#7a4a4a]/90 px-3 py-1 font-['Inter'] text-[11px] font-medium text-white shadow-sm">
                  {t("analysis.tapMap")}
                </p>
              </div>
            )}
            {locationError && (
              <p className="absolute inset-x-4 bottom-4 z-[500] rounded-md bg-white/95 px-3 py-2 text-xs text-red-600 shadow-sm">
                {t("analysis.locationNotFound")}
              </p>
            )}
          </>
        )}
      </section>

      <section
        aria-label="Sun timing and time control"
        className="absolute left-0 top-[700px] z-30 flex w-full flex-col rounded-md bg-[#f9f9f9f0] px-4 py-2 pb-[120px] backdrop-blur-sm"
      >
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
            style={{ accentColor: primaryColor }}
          />
          <label
            className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center"
            aria-label={t("analysis.pickColor")}
          >
            <input
              type="color"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              className="h-5 w-5 rounded-full border border-black/10"
              style={{ backgroundColor: primaryColor }}
              aria-hidden="true"
            />
          </label>
          <button
            type="button"
            onClick={() => setPrimaryPathVisible((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e8] bg-white text-[#7a4a4a] transition-colors hover:bg-neutral-50"
            aria-label={primaryPathVisible ? t("analysis.hideSunPath") : t("analysis.showSunPath")}
            aria-pressed={!primaryPathVisible}
          >
            {primaryPathVisible ? <Eye className="h-5 w-5" aria-hidden="true" /> : <EyeOff className="h-5 w-5" aria-hidden="true" />}
          </button>
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

        {overlaySunData.map(({ overlay, times, currentTime }) => (
          <div key={overlay.id} className="border-t border-[#e8e8e8] pt-1.5" style={{ opacity: overlay.visible ? 1 : 0.45 }}>
            {times ? (
              <div className="mb-0.5 flex items-center justify-between font-['Inter'] text-[10px] text-[#828282]">
                <span>{t("analysis.sunrise")} {formatClock(times.sunrise, locationTimeZone)}</span>
                <span>{t("analysis.noon")} {formatClock(times.noon, locationTimeZone)}</span>
                <span>{t("analysis.sunset")} {formatClock(times.sunset, locationTimeZone)}</span>
              </div>
            ) : (
              <div className="mb-0.5 h-[12px]" />
            )}
            <div className="flex items-center gap-2">
              <input
                aria-label={`Time of day for ${overlay.label}`}
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                value={overlay.selectedTime}
                onChange={(event) => handleOverlayTimeChange(overlay.id, Number(event.target.value))}
                className="h-8 flex-1"
                style={{ accentColor: overlay.color }}
              />
              <label
                className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center"
                aria-label={`Pick color for ${overlay.label}`}
              >
                <input
                  type="color"
                  value={overlay.color}
                  onChange={(event) => handleOverlayColorChange(overlay.id, event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: overlay.color }}
                  aria-hidden="true"
                />
              </label>
              <button
                type="button"
                onClick={() => togglePathVisibility(overlay.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e8] bg-white transition-colors hover:bg-neutral-50"
                style={{ color: overlay.color }}
                aria-label={overlay.visible ? `Hide ${overlay.label}` : `Show ${overlay.label}`}
                aria-pressed={!overlay.visible}
              >
                {overlay.visible ? <Eye className="h-5 w-5" aria-hidden="true" /> : <EyeOff className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => removePath(overlay.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e8] bg-white transition-colors hover:bg-neutral-50"
                style={{ color: overlay.color }}
                aria-label={`Remove ${overlay.label}`}
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div
              className="flex items-center gap-1.5 pt-0.5 font-['Inter'] text-xs font-medium"
              style={{ color: overlay.color }}
            >
              <span>{overlay.label}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {formatClock(currentTime, locationTimeZone)}
                <label
                  className="relative flex cursor-pointer items-center"
                  aria-label={`Time of day for ${overlay.label}`}
                >
                  <input
                    type="time"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    value={toTimeInputValue(currentTime, locationTimeZone)}
                    onChange={(e) => handleOverlayTimeInputChange(overlay.id, e)}
                    aria-label={`Time of day for ${overlay.label}`}
                  />
                  <Clock3Icon className="h-4 w-4" aria-hidden="true" />
                </label>
              </span>
            </div>
          </div>
        ))}
      </section>

      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-[1000] mx-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px]"
      >
        <div className="grid h-[49px] w-full grid-cols-4 justify-items-center">
          {navigationItems.map(({ labelKey, Icon }) => (
            <Button
              key={labelKey}
              type="button"
              variant="ghost"
              onClick={() => handleNavigation(labelKey)}
              className="min-h-12 flex flex-col items-center justify-center gap-0 p-0 [font-family:'Adamina',Helvetica] text-[10px] leading-[normal] tracking-[-0.24px] text-[#7a4a4a] hover:bg-transparent hover:text-[#7a4a4a]"
            >
              <Icon className="mb-0.5 h-6 w-6" aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </Button>
          ))}
        </div>
        <div className="h-[34px]" />
      </nav>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-[100vw] animate-slide-up rounded-t-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-['Inter'] text-lg font-semibold text-[#7a4a4a]">{t("analysis.addOverlay")}</h2>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
                className="h-12 w-12 p-0 text-[#7a4a4a] hover:bg-neutral-100"
                aria-label={t("analysis.close")}
              >
                <XIcon className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <p className="mb-2 font-['Inter'] text-xs font-medium uppercase tracking-wider text-[#828282]">
              {t("analysis.seasonalPresets")}
            </p>
            <div className="mb-4 space-y-2">
              {SEASONAL_PRESETS.map((preset) => (
                <button
                  key={preset.labelKey}
                  type="button"
                  onClick={() => addPresetPath(preset)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[#eee] px-3 py-3.5 text-left transition-colors hover:bg-neutral-50"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: preset.color }}
                    aria-hidden="true"
                  />
                  <span className="font-['Inter'] text-sm text-[#333]">{t(preset.labelKey)}</span>
                  <PlusIcon className="ml-auto h-4 w-4 text-[#bbb]" aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="border-t border-[#eee] pt-4">
              <p className="mb-2 font-['Inter'] text-xs font-medium uppercase tracking-wider text-[#828282]">
                {t("analysis.customDate")}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="flex-1 rounded-lg border border-[#ddd] px-3 py-2 font-['Inter'] text-sm text-[#333] focus:border-[#7a4a4a] focus:outline-none"
                  aria-label={t("analysis.customDate")}
                />
                <Button
                  type="button"
                  onClick={addCustomPath}
                  className="min-h-12 rounded-lg bg-[#7a4a4a] px-4 py-3 font-['Inter'] text-sm font-medium text-white hover:bg-[#6b3f3f]"
                >
                  {t("analysis.add")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

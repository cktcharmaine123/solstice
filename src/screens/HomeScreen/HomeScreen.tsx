import {
  MapPin,
  Home,
  Leaf,
  BarChart,
  Settings,
  Search as SearchIcon,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import "leaflet-rotate";
import "leaflet/dist/leaflet.css";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLanguage } from "../../i18n/LanguageContext";
import { useSplash } from "../SplashScreen/SplashContext";
import type { TranslationKey } from "../../i18n/translations";

// Fix default marker icon paths under bundlers like Vite
const defaultIcon = L.icon({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

type QuickFilter = {
  id: string;
  labelKey: TranslationKey;
  Icon: LucideIcon;
  iconClassName: string;
};

type NavigationItem = {
  id: string;
  labelKey: TranslationKey;
  Icon: LucideIcon;
  iconClassName: string;
};

type SearchedLocation = {
  lat: number;
  lng: number;
  label: string;
};

const quickFilters: QuickFilter[] = [
  {
    id: "current-location",
    labelKey: "home.currentLocation" as TranslationKey,
    Icon: MapPin,
    iconClassName: "h-[22px] w-[22px]",
  },
];

const navigationItems: { id: string; labelKey: TranslationKey; Icon: LucideIcon; iconClassName: string }[] = [
  {
    id: "home",
    labelKey: "nav.home",
    Icon: Home,
    iconClassName: "h-[29px] w-[29px]",
  },
  {
    id: "locations",
    labelKey: "nav.locations",
    Icon: Leaf,
    iconClassName: "h-[22px] w-[22px]",
  },
  {
    id: "graphs",
    labelKey: "nav.graphs",
    Icon: BarChart,
    iconClassName: "h-[23px] w-[23px]",
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    Icon: Settings,
    iconClassName: "h-[25px] w-[25px]",
  },
];

const DEFAULT_CENTER: [number, number] = [22.3193, 114.1694]; // Hong Kong
const DEFAULT_ZOOM = 13;

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

async function geocode(query: string): Promise<SearchedLocation | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    query,
  )}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as NominatimResult[];
  if (!data || data.length === 0) return null;
  const first = data[0];
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    label: first.display_name,
  };
}

function MapController({
  target,
}: {
  target: SearchedLocation | null;
}): null {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 15, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}): null {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapReadySignal({ onReady }: { onReady: () => void }): null {
  const map = useMap();
  useEffect(() => {
    const handler = () => onReady();
    map.on("load", handler);
    if (map._loaded) onReady();
    return () => {
      map.off("load", handler);
    };
  }, [map, onReady]);
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

    const updateDial = () => {
      if (dial) dial.style.transform = `rotate(${-map.getBearing()}deg)`;
    };

    updateDial();
    map.on("move rotate", updateDial);

    const onReset = (e: Event) => {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      map.setBearing(0);
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

export const HomeScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signalMapRequested, signalMapReady } = useSplash();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeNavigation, setActiveNavigation] = useState("home");
  const [searchValue, setSearchValue] = useState("");
  const [searchedLocation, setSearchedLocation] =
    useState<SearchedLocation | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const result = await geocode(trimmed);
      if (result) {
        setSearchedLocation(result);
        navigate(`/analysis?location=${encodeURIComponent(trimmed)}`);
      } else {
        setSearchError(t("home.locationNotFound"));
      }
    } catch {
      setSearchError(t("home.searchFailed"));
    } finally {
      setIsSearching(false);
    }
  }, []);

  const [locationFailed, setLocationFailed] = useState(false);

  const requestLocation = useCallback((): void => {
    if (!navigator.geolocation) {
      setSearchError(t("home.geolocationUnsupported"));
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const label = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        const loc: SearchedLocation = { lat: latitude, lng: longitude, label };
        setSearchedLocation(loc);
        setIsSearching(false);
        setLocationFailed(false);
        navigate(`/analysis?lat=${latitude}&lng=${longitude}`);
      },
      (error: GeolocationPositionError) => {
        setIsSearching(false);
        setLocationFailed(true);
        switch (error.code) {
          case 1:
            setSearchError(t("home.locationDenied"));
            break;
          case 2:
            setSearchError(t("home.locationUnavailable"));
            break;
          case 3:
            setSearchError(t("home.locationTimeout"));
            break;
          default:
            setSearchError(t("home.couldNotGetLocation"));
            break;
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [t, navigate]);

  const handleCurrentLocation = useCallback((): void => {
    requestLocation();
  }, [requestLocation]);

  const handleMapPick = useCallback((lat: number, lng: number) => {
    const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setSearchedLocation({ lat, lng, label });
  }, []);

  const handlePickedAnalyze = useCallback(() => {
    if (!searchedLocation) return;
    navigate(`/analysis?lat=${searchedLocation.lat}&lng=${searchedLocation.lng}`);
  }, [searchedLocation, navigate]);

  useEffect(() => {
    signalMapRequested();
  }, [signalMapRequested]);

  const onMapReady = useCallback(() => {
    signalMapReady();
  }, [signalMapReady]);

  return (
    <main className="app-container mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-white">
      <section className="px-[23px] pt-[84px]" aria-label="Location search">
        <div className="flex h-10 items-center gap-3 rounded-lg bg-neutral-100 px-3 py-2">
          <SearchIcon
            className="h-6 w-6 shrink-0 text-[#828282]"
            aria-hidden="true"
          />
          <Input
            aria-label={t("home.searchPlaceholder")}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch(searchValue);
            }}
            className="h-auto flex-1 border-0 bg-transparent p-0 font-presets-body2 text-[length:var(--presets-body2-font-size)] font-[number:var(--presets-body2-font-weight)] leading-[var(--presets-body2-line-height)] tracking-[var(--presets-body2-letter-spacing)] text-[#828282] shadow-none placeholder:text-[#828282] focus-visible:ring-0"
            placeholder={t("home.searchPlaceholder")}
          />
          {isSearching && (
            <span className="text-xs text-[#828282]">...</span>
          )}
        </div>
        {searchError && (
          <div className="mt-1 flex flex-col gap-2 px-1">
            <p className="text-xs text-red-500">{searchError}</p>
            {locationFailed && (
              <button
                type="button"
                onClick={requestLocation}
                disabled={isSearching}
                className="flex h-9 w-fit items-center gap-2 rounded-full bg-[#7a4a4a] px-4 font-['Inter'] text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#6b3f3f] disabled:opacity-50"
              >
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                {t("home.locateMe")}
              </button>
            )}
          </div>
        )}
        <div
          className="mt-5 flex h-8 items-center gap-2"
          aria-label="Location filters"
        >
          {quickFilters.map(({ id, labelKey, Icon, iconClassName }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              onClick={() => {
                if (id === "current-location") {
                  handleCurrentLocation();
                } else {
                  setActiveFilter((currentFilter) =>
                    currentFilter === id ? null : id,
                  );
                }
              }}
              aria-pressed={activeFilter === id}
              className="min-h-12 shrink-0 gap-1 rounded-md border-[#e6e6e6] bg-white px-3 py-2.5 [font-family:'Adamina',Helvetica] text-sm font-normal leading-[22px] text-[#7a4a4a] shadow-none hover:bg-neutral-50"
            >
              <Icon className={iconClassName} aria-hidden="true" />
              <span className="mt-[-1px] whitespace-nowrap">{t(labelKey)}</span>
            </Button>
          ))}
        </div>
      </section>
      <figure className="relative mx-px mt-[88px] aspect-square w-[calc(100%-2px)] overflow-hidden md:mt-[88px] md:aspect-auto md:h-[600px]">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          zoomControl
          dragging
          attributionControl={false}
          preferCanvas={true}
          rotate
          touchRotate
          shiftKeyRotate
          rotateControl={false}
          className="h-full w-full"
          style={{ borderRadius: "inherit" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {searchedLocation && (
            <Marker position={[searchedLocation.lat, searchedLocation.lng]}>
              <Popup className="brown-popup">{searchedLocation.label}</Popup>
            </Marker>
          )}
          <MapController target={searchedLocation} />
          <MapClickHandler onPick={handleMapPick} />
          <RightClickRotateHandler />
          <CompassControl />
          <MapReadySignal onReady={onMapReady} />
        </MapContainer>
      </figure>
      {searchedLocation && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            onClick={handlePickedAnalyze}
            className="min-h-12 rounded-full bg-[#7a4a4a] px-6 py-3 text-sm font-semibold text-white shadow-xl hover:bg-[#6b3f3f]"
          >
            {t("home.analyzeLocation")}
          </Button>
        </div>
      )}
      <nav
        className="relative z-[1000] mt-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] backdrop-blur-[10px]"
        aria-label="Primary navigation"
      >
        <div className="grid h-[49px] grid-cols-4">
          {navigationItems.map(({ id, labelKey, Icon, iconClassName }) => {
            const isHome = id === "home";
            return (
              <Button
                key={id}
                type="button"
                variant="ghost"
                disabled={isHome}
                onClick={() => {
                setActiveNavigation(id);
                if (id === "home") navigate("/home");
                if (id === "locations") navigate("/locations");
                if (id === "graphs") navigate("/graphs");
                if (id === "settings") navigate("/settings");
              }}
                aria-current={activeNavigation === id ? "page" : undefined}
                className="h-auto flex h-[49px] flex-col items-center justify-start rounded-none p-0 text-[#7a4a4a] hover:bg-transparent hover:text-[#7a4a4a] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#7a4a4a]"
              >
                <Icon
                  className={`${iconClassName} mt-[7px]`}
                  aria-hidden="true"
                />
                <span className="mt-[1px] [font-family:'Adamina',Helvetica] text-[10px] font-normal leading-normal tracking-[-0.24px]">
                  {t(labelKey)}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="h-[34px]" />
      </nav>
    </main>
  );
};

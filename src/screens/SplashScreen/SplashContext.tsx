import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SplashScreen } from "./SplashScreen";

type SplashContextValue = {
  signalMapRequested: () => void;
  signalMapReady: () => void;
};

const SplashContext = createContext<SplashContextValue | null>(null);

const MIN_DURATION = 2000;
const MAX_DURATION = 3000;

export function SplashProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isVisible, setIsVisible] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapRequested, setMapRequested] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_DURATION);
    const maxTimer = setTimeout(() => setIsVisible(false), MAX_DURATION);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (minElapsed && (mapReady || !mapRequested)) {
      setIsVisible(false);
    }
  }, [minElapsed, mapReady, mapRequested, isVisible]);

  const signalMapRequested = useCallback(() => setMapRequested(true), []);
  const signalMapReady = useCallback(() => setMapReady(true), []);

  return (
    <SplashContext.Provider value={{ signalMapRequested, signalMapReady }}>
      <SplashScreen isVisible={isVisible} />
      {children}
    </SplashContext.Provider>
  );
}

export function useSplash(): SplashContextValue {
  const ctx = useContext(SplashContext);
  if (!ctx) throw new Error("useSplash must be used within a SplashProvider");
  return ctx;
}

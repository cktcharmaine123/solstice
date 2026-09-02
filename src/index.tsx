import "./tailwind.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { SplashProvider } from "./screens/SplashScreen/SplashContext";
import { SignInScreen } from "./screens/SignInScreen/SignInScreen";
import { PrivacyPolicyScreen } from "./screens/PrivacyPolicyScreen/PrivacyPolicyScreen";
import { HomeScreen } from "./screens/HomeScreen/HomeScreen";
import { AnalysisScreen } from "./screens/AnalysisScreen/AnalysisScreen";
import { LocationsScreen } from "./screens/LocationsScreen/LocationsScreen";
import { GraphsScreen } from "./screens/GraphsScreen/GraphsScreen";
import { GraphDetailScreen } from "./screens/GraphDetailScreen/GraphDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen/SettingsScreen";
import { LanguageScreen } from "./screens/LanguageScreen/LanguageScreen";
import { ThreeDAnalysisScreen } from "./screens/ThreeDAnalysisScreen/ThreeDAnalysisScreen";

// 1. Locate container safely
const container = document.getElementById("app") || document.getElementById("root");

if (!container) {
  document.body.innerHTML = "<h1 style='color:red;padding:20px;'>Mounting element missing!</h1>";
} else {
  // 2. Direct top-level render call guarantees Vite bundles the app
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <HashRouter>
        <LanguageProvider>
          <SplashProvider>
            <Routes>
              <Route path="/" element={<SignInScreen />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyScreen />} />
              <Route path="/home" element={<HomeScreen />} />
              <Route path="/analysis" element={<AnalysisScreen />} />
              <Route path="/locations" element={<LocationsScreen />} />
              <Route path="/graphs" element={<GraphsScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/language" element={<LanguageScreen />} />
              <Route path="/analysis-3d" element={<ThreeDAnalysisScreen />} />
              <Route path="/graph/:graphId" element={<GraphDetailScreen />} />
              <Route path="*" element={<SignInScreen />} />
            </Routes>
          </SplashProvider>
        </LanguageProvider>
      </HashRouter>
    </StrictMode>
  );
}
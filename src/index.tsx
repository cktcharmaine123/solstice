import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <LanguageProvider>
      <SplashProvider>
        <BrowserRouter>
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
          </Routes>
        </BrowserRouter>
      </SplashProvider>
    </LanguageProvider>
  </StrictMode>,
);

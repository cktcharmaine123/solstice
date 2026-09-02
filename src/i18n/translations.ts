export type Language = "en" | "zh-TW";

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "zh-TW", label: "Traditional Chinese", nativeLabel: "繁體中文" },
];

export type TranslationKey =
  | "signIn.continue"
  | "signIn.agreePrefix"
  | "signIn.privacyPolicy"
  | "nav.home"
  | "nav.locations"
  | "nav.graphs"
  | "nav.settings"
  | "home.searchPlaceholder"
  | "home.currentLocation"
  | "home.analyzeLocation"
  | "home.locationNotFound"
  | "home.searchFailed"
  | "home.geolocationUnsupported"
  | "home.locationPermissionDenied"
  | "home.couldNotGetLocation"
  | "home.defaultLocation"
  | "home.locateMe"
  | "home.locationDenied"
  | "home.locationUnavailable"
  | "home.locationTimeout"
  | "locations.searchPlaceholder"
  | "locations.savedLocations"
  | "locations.loading"
  | "locations.loadError"
  | "locations.empty"
  | "locations.nameEmpty"
  | "locations.renameError"
  | "graphs.searchPlaceholder"
  | "graphs.savedGraphs"
  | "graphs.empty"
  | "graphs.confirmRename"
  | "graphs.cancelRename"
  | "graphs.delete"
  | "graphDetail.backToGraphs"
  | "graphDetail.download"
  | "graphDetail.notAvailable"
  | "analysis.goBack"
  | "analysis.searchLocation"
  | "analysis.findingLocation"
  | "analysis.saveLocation"
  | "analysis.saveGraph"
  | "analysis.addSunPath"
  | "analysis.threeDAnalysis"
  | "analysis.sunPosition"
  | "analysis.altitude"
  | "analysis.azimuth"
  | "analysis.tapMap"
  | "analysis.locationNotFound"
  | "analysis.sunrise"
  | "analysis.solarNoon"
  | "analysis.sunset"
  | "analysis.noon"
  | "analysis.timeOfDay"
  | "analysis.pickColor"
  | "analysis.selectDate"
  | "analysis.addOverlay"
  | "analysis.seasonalPresets"
  | "analysis.customDate"
  | "analysis.add"
  | "analysis.close"
  | "analysis.summerSolstice"
  | "analysis.winterSolstice"
  | "analysis.equinox"
  | "analysis.summerShort"
  | "analysis.winterShort"
  | "analysis.equinoxShort"
  | "analysis.somethingWentWrong"
  | "analysis.mapLoadError"
  | "analysis.loadingMap"
  | "analysis.couldNotSaveLocation"
  | "analysis.couldNotSaveGraph"
  | "analysis.locationSaved"
  | "analysis.graphSaved"
  | "analysis.revert"
  | "analysis.reverted"
  | "analysis.hideSunPath"
  | "analysis.showSunPath"
  | "threed.focusBuilding"
  | "threed.focusBuildingActive"
  | "threed.focusedOnBuilding"
  | "threed.clearFocus"
  | "threed.tapToSelect"
  | "threed.sunlightHours"
  | "threed.analyzing"
  | "threed.legend"
  | "threed.legendHigh"
  | "threed.legendMid"
  | "threed.legendLow"
  | "threed.selectBuilding"
  | "threed.cancelSelection"
  | "threed.noBuildingFound"
  | "threed.transitioning"
  | "settings.title"
  | "settings.language"
  | "settings.privacyPolicy"
  | "language.title"
  | "privacy.title"
  | "privacy.sections";

type Dictionary = Record<TranslationKey, string>;

const en: Dictionary = {
  "signIn.continue": "Continue",
  "signIn.agreePrefix": "By clicking continue, you agree to our",
  "signIn.privacyPolicy": "Privacy Policy",

  "nav.home": "Home",
  "nav.locations": "Locations",
  "nav.graphs": "Graphs",
  "nav.settings": "Settings",

  "home.searchPlaceholder": "Search Location",
  "home.currentLocation": "Current Location",
  "home.analyzeLocation": "Analyze this location",
  "home.locationNotFound": "Location not found",
  "home.searchFailed": "Search failed",
  "home.geolocationUnsupported": "Geolocation is not supported on this device",
  "home.locationPermissionDenied": "Location permission denied",
  "home.couldNotGetLocation": "Could not get your location",
  "home.defaultLocation": "Default Location",
  "home.locateMe": "Locate Me",
  "home.locationDenied": "Location access was denied. Please check your mobile browser settings.",
  "home.locationUnavailable": "Location information is unavailable.",
  "home.locationTimeout": "The location request timed out. Please try again.",

  "locations.searchPlaceholder": "Search From Saved Locations",
  "locations.savedLocations": "Saved Locations",
  "locations.loading": "Loading saved locations...",
  "locations.loadError": "Saved locations could not be loaded.",
  "locations.empty": "No saved locations yet.",
  "locations.nameEmpty": "Name cannot be empty",
  "locations.renameError": "Could not rename location",

  "graphs.searchPlaceholder": "Search Saved Graphs",
  "graphs.savedGraphs": "Saved Graphs",
  "graphs.empty": 'No saved graphs yet. Use "Save Graph" on the analysis screen to store one.',
  "graphs.confirmRename": "Confirm rename",
  "graphs.cancelRename": "Cancel rename",
  "graphs.delete": "Delete",

  "graphDetail.backToGraphs": "Back to saved graphs",
  "graphDetail.download": "Download saved graph",
  "graphDetail.notAvailable": "This saved graph is no longer available.",

  "analysis.goBack": "Go Back",
  "analysis.searchLocation": "Search for a location",
  "analysis.findingLocation": "Finding location...",
  "analysis.saveLocation": "Save Location",
  "analysis.saveGraph": "Save Graph",
  "analysis.addSunPath": "Add new sun path",
  "analysis.threeDAnalysis": "3D analysis",
  "analysis.sunPosition": "Sun position",
  "analysis.altitude": "altitude",
  "analysis.azimuth": "azimuth",
  "analysis.tapMap": "Tap the map to analyze a new spot",
  "analysis.locationNotFound": "Could not find this location. Try a more specific search term.",
  "analysis.sunrise": "Sunrise",
  "analysis.solarNoon": "Solar noon",
  "analysis.sunset": "Sunset",
  "analysis.noon": "Noon",
  "analysis.timeOfDay": "Time of day",
  "analysis.pickColor": "Sun path color",
  "analysis.selectDate": "Select date",
  "analysis.addOverlay": "Add Sun Path Overlay",
  "analysis.seasonalPresets": "Seasonal Presets",
  "analysis.customDate": "Custom Date",
  "analysis.add": "Add",
  "analysis.close": "Close",
  "analysis.summerSolstice": "Summer Solstice (June 21)",
  "analysis.winterSolstice": "Winter Solstice (December 21)",
  "analysis.equinox": "Equinox (March 21)",
  "analysis.summerShort": "June 21 Solstice",
  "analysis.winterShort": "Dec 21 Solstice",
  "analysis.equinoxShort": "March 21 Equinox",
  "analysis.somethingWentWrong": "Something went wrong",
  "analysis.mapLoadError": "The map could not be loaded. Please try navigating back and searching again.",
  "analysis.loadingMap": "Loading site map...",
  "analysis.couldNotSaveLocation": "Could not save this location.",
  "analysis.couldNotSaveGraph": "Could not save the graph. Please try again.",
  "analysis.locationSaved": "Location saved",
  "analysis.graphSaved": "Graph saved",
  "analysis.revert": "Revert",
  "analysis.reverted": "Reverted",
  "analysis.hideSunPath": "Hide sun path",
  "analysis.showSunPath": "Show sun path",

  "threed.focusBuilding": "Focus on building",
  "threed.focusBuildingActive": "Tap a building",
  "threed.focusedOnBuilding": "Focused on building",
  "threed.clearFocus": "Clear focus",
  "threed.tapToSelect": "Tap a 3D building to analyze its sunlight",
  "threed.sunlightHours": "hours of sunlight",
  "threed.analyzing": "Analyzing sunlight...",
  "threed.legend": "Sunlight exposure",
  "threed.legendHigh": "8+ hrs",
  "threed.legendMid": "4-6 hrs",
  "threed.legendLow": "<1 hr",
  "threed.selectBuilding": "Tap a building to analyze its sunlight",
  "threed.cancelSelection": "Cancel",
  "threed.noBuildingFound": "No building found, try tapping a building",
  "threed.transitioning": "Switching to 2D map...",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.privacyPolicy": "Privacy Policy",

  "language.title": "Language",

  "privacy.title": "Privacy Policy",
  "privacy.sections": "sections",
};

const zhTW: Dictionary = {
  "signIn.continue": "繼續",
  "signIn.agreePrefix": "點擊繼續即表示您同意我們的",
  "signIn.privacyPolicy": "隱私政策",

  "nav.home": "首頁",
  "nav.locations": "位置",
  "nav.graphs": "圖表",
  "nav.settings": "設定",

  "home.searchPlaceholder": "搜尋位置",
  "home.currentLocation": "目前位置",
  "home.analyzeLocation": "分析此位置",
  "home.locationNotFound": "找不到位置",
  "home.searchFailed": "搜尋失敗",
  "home.geolocationUnsupported": "此裝置不支援定位功能",
  "home.locationPermissionDenied": "定位權限被拒絕",
  "home.couldNotGetLocation": "無法取得您的位置",
  "home.defaultLocation": "預設位置",
  "home.locateMe": "定位我",
  "home.locationDenied": "定位權限被拒絕。請檢查您的行動瀏覽器設定。",
  "home.locationUnavailable": "無法取得定位資訊。",
  "home.locationTimeout": "定位請求已逾時。請再試一次。",

  "locations.searchPlaceholder": "從已儲存位置搜尋",
  "locations.savedLocations": "已儲存位置",
  "locations.loading": "正在載入已儲存位置...",
  "locations.loadError": "無法載入已儲存位置。",
  "locations.empty": "尚無已儲存位置。",
  "locations.nameEmpty": "名稱不可為空",
  "locations.renameError": "無法重新命名位置",

  "graphs.searchPlaceholder": "搜尋已儲存圖表",
  "graphs.savedGraphs": "已儲存圖表",
  "graphs.empty": "尚無已儲存圖表。請在分析頁面使用「儲存圖表」來保存。",
  "graphs.confirmRename": "確認重新命名",
  "graphs.cancelRename": "取消重新命名",
  "graphs.delete": "刪除",

  "graphDetail.backToGraphs": "返回已儲存圖表",
  "graphDetail.download": "下載已儲存圖表",
  "graphDetail.notAvailable": "此已儲存圖表已無法使用。",

  "analysis.goBack": "返回",
  "analysis.searchLocation": "搜尋位置",
  "analysis.findingLocation": "正在尋找位置...",
  "analysis.saveLocation": "儲存位置",
  "analysis.saveGraph": "儲存圖表",
  "analysis.addSunPath": "新增太陽路徑",
  "analysis.threeDAnalysis": "3D 分析",
  "analysis.sunPosition": "太陽位置",
  "analysis.altitude": "仰角",
  "analysis.azimuth": "方位角",
  "analysis.tapMap": "點擊地圖以分析新位置",
  "analysis.locationNotFound": "找不到此位置。請嘗試更具體的搜尋字詞。",
  "analysis.sunrise": "日出",
  "analysis.solarNoon": "正午",
  "analysis.sunset": "日落",
  "analysis.noon": "正午",
  "analysis.timeOfDay": "時間",
  "analysis.pickColor": "太陽路徑顏色",
  "analysis.selectDate": "選擇日期",
  "analysis.addOverlay": "新增太陽路徑疊加層",
  "analysis.seasonalPresets": "季節預設",
  "analysis.customDate": "自訂日期",
  "analysis.add": "新增",
  "analysis.close": "關閉",
  "analysis.summerSolstice": "夏至（6月21日）",
  "analysis.winterSolstice": "冬至（12月21日）",
  "analysis.equinox": "春分（3月21日）",
  "analysis.summerShort": "6月21日 夏至",
  "analysis.winterShort": "12月21日 冬至",
  "analysis.equinoxShort": "3月21日 春分",
  "analysis.somethingWentWrong": "發生錯誤",
  "analysis.mapLoadError": "無法載入地圖。請嘗試返回並重新搜尋。",
  "analysis.loadingMap": "正在載入地圖...",
  "analysis.couldNotSaveLocation": "無法儲存此位置。",
  "analysis.couldNotSaveGraph": "無法儲存圖表，請再試一次。",
  "analysis.locationSaved": "位置已儲存",
  "analysis.graphSaved": "圖表已儲存",
  "analysis.revert": "復原",
  "analysis.reverted": "已復原",
  "analysis.hideSunPath": "隱藏太陽路徑",
  "analysis.showSunPath": "顯示太陽路徑",

  "threed.focusBuilding": "聚焦建築物",
  "threed.focusBuildingActive": "點擊建築物",
  "threed.focusedOnBuilding": "已聚焦建築物",
  "threed.clearFocus": "清除聚焦",
  "threed.tapToSelect": "點擊3D建築物以分析其日照",
  "threed.sunlightHours": "小時日照",
  "threed.analyzing": "正在分析日照...",
  "threed.legend": "日照時數",
  "threed.legendHigh": "8+ 小時",
  "threed.legendMid": "4-6 小時",
  "threed.legendLow": "<1 小時",
  "threed.selectBuilding": "點擊建築物以分析其日照",
  "threed.cancelSelection": "取消",
  "threed.noBuildingFound": "找不到建築物，請再試一次",
  "threed.transitioning": "切換至2D地圖...",

  "settings.title": "設定",
  "settings.language": "語言",
  "settings.privacyPolicy": "隱私政策",

  "language.title": "語言",

  "privacy.title": "隱私政策",
  "privacy.sections": "sections",
};

export const translations: Record<Language, Dictionary> = {
  en,
  "zh-TW": zhTW,
};

export const privacyPolicyContent: Record<Language, { title: string; sections: { title: string; paragraphs: string[]; bullets?: string[]; trailingParagraph?: string }[] }> = {
  en: {
    title: "Privacy Policy",
    sections: [
      {
        title: "1. Introduction:",
        paragraphs: [
          'This Privacy Policy applies to the Sun Path Application ("Solstice"). We are committed to protecting your privacy and ensuring that your personal data is handled securely. This policy explains what information we collect, how it is used, and how it is stored.',
        ],
      },
      {
        title: "2. Information We Collect: To provide the core functionality of the App, we request access to the following:",
        paragraphs: [
          "Precise Location Data (GPS): With your explicit permission, the App accesses your device's real-time location to accurately calculate the sun's position, path, and altitude relative to your specific site.",
        ],
      },
      {
        title: "3. How We Use Your Information:",
        paragraphs: ["Your location data is used solely for the functional operation of the App/Website. Specifically, it is used to:"],
        bullets: [
          "Generate accurate 2D  sun path diagrams.",
          "Allow you to save specific site locations and generated graphs for your own reference.",
        ],
      },
      {
        title: "4. Data Storage and Security (Local-Only):",
        paragraphs: [
          "Your privacy is guaranteed by the architecture of the App. All data, including your GPS coordinates, saved locations, and generated graphs, is stored strictly locally on your device.",
        ],
        bullets: [
          "We do not use external servers or cloud databases.",
          "Your data is never transmitted to us or any third parties.",
          "We do not sell, share, or monetize your personal information.",
        ],
        trailingParagraph:
          "Because all data lives exclusively on your hardware, you retain total control over it. Deleting the App or clearing its local storage will permanently erase your saved locations and graphs.",
      },
      {
        title: "5. Your Controls and Permissions:",
        paragraphs: [
          "You can manage or revoke the App/Website's access to your location at any time through your device's system settings (iOS or Android). If you choose to disable location access, you may still use the App by manually entering coordinates, but the automatic site-detection features will be disabled.",
        ],
      },
      {
        title: "6. Changes to This Privacy Policy:",
        paragraphs: ["We may update this Privacy Policy from time to time to reflect changes in our app or regulatory requirements. Any changes will be updated within the App/Website."],
      },
      {
        title: "7. Contact Us: If you have any questions about this Privacy Policy or how your data is handled, please contact us at:",
        paragraphs: ["cktcharmaine@gmail.com"],
      },
    ],
  },
  "zh-TW": {
    title: "隱私政策",
    sections: [
      {
        title: "1. 簡介：",
        paragraphs: [
          "本隱私政策適用於太陽路徑應用程式（「Solstice」）。我們致力於保護您的隱私，並確保您的個人資料得到安全處理。本政策說明我們收集哪些資訊、如何使用以及如何儲存。",
        ],
      },
      {
        title: "2. 我們收集的資訊：為提供應用程式的核心功能，我們要求存取以下內容：",
        paragraphs: [
          "精確定位資料（GPS）：在您的明確許可下，應用程式會存取您裝置的即時位置，以準確計算太陽相對於您所在位置的位置、路徑和仰角。",
        ],
      },
      {
        title: "3. 我們如何使用您的資訊：",
        paragraphs: ["您的位置資料僅用於應用程式/網站的功能運作。具體用途包括："],
        bullets: [
          "生成準確的 2D 太陽路徑圖。",
          "讓您儲存特定位置和生成的圖表以供自己參考。",
        ],
      },
      {
        title: "4. 資料儲存與安全（僅限本地）：",
        paragraphs: [
          "您的隱私由應用程式的架構所保障。所有資料，包括您的 GPS 座標、已儲存位置和生成的圖表，均嚴格儲存在您的裝置本地。",
        ],
        bullets: [
          "我們不使用外部伺服器或雲端資料庫。",
          "您的資料絕不會傳輸給我們或任何第三方。",
          "我們不會出售、分享或將您的個人資訊商業化。",
        ],
        trailingParagraph:
          "由於所有資料均獨家儲存在您的硬體上，您對其擁有完全控制權。刪除應用程式或清除其本地儲存將永久刪除您已儲存的位置和圖表。",
      },
      {
        title: "5. 您的控制和權限：",
        paragraphs: [
          "您可以隨時透過裝置的系統設定（iOS 或 Android）管理或撤銷應用程式/網站對您位置的存取權限。如果您選擇停用定位存取，您仍可手動輸入座標使用應用程式，但自動位置偵測功能將被停用。",
        ],
      },
      {
        title: "6. 本隱私政策的變更：",
        paragraphs: ["我們可能會不時更新本隱私政策，以反映應用程式或法規要求的變更。任何變更都會在應用程式/網站中更新。"],
      },
      {
        title: "7. 聯絡我們：如果您對本隱私政策或您的資料處理方式有任何疑問，請聯絡我們：",
        paragraphs: ["cktcharmaine@gmail.com"],
      },
    ],
  },
};

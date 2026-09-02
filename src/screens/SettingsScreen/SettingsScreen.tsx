import { useNavigate } from "react-router-dom";
import { ChevronRight, Home, Leaf, BarChart, Settings as Gear } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";

const navigationItems: { labelKey: TranslationKey; Icon: typeof Home; path: string }[] = [
  { labelKey: "nav.home", Icon: Home, path: "/home" },
  { labelKey: "nav.locations", Icon: Leaf, path: "/locations" },
  { labelKey: "nav.graphs", Icon: BarChart, path: "/graphs" },
  { labelKey: "nav.settings", Icon: Gear, path: "/settings" },
];

export const SettingsScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <main className="app-container relative mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-white">
      <section className="mx-auto mt-auto mb-auto w-full max-w-[340px] px-4 text-center md:max-w-[640px]" aria-labelledby="settings-heading">
        <h1
          id="settings-heading"
          className="[font-family:'Adamina',Helvetica] text-[37px] font-normal leading-[44px] text-[#7a4a4a]"
        >
          {t("settings.title")}
        </h1>
        <div className="mt-[20px] flex w-full flex-col gap-[22px]">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/language")}
            className="h-auto w-full rounded-none p-0 text-left font-normal hover:bg-transparent"
          >
            <span className="flex min-h-12 w-full flex-col gap-[9.5px] py-1">
              <span className="flex w-full items-start justify-between">
                <span className="mt-[3px] [font-family:'Adamina',Helvetica] text-sm font-normal leading-[14px] text-[#1e1e2d]">
                  {t("settings.language")}
                </span>
                <ChevronRight className="h-6 w-6 text-[#1e1e2d]" aria-hidden="true" />
              </span>
              <span className="h-px w-full bg-[#707070]" />
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/privacy-policy")}
            className="h-auto w-full rounded-none p-0 text-left font-normal hover:bg-transparent"
          >
            <span className="flex min-h-12 w-full flex-col gap-[9.5px] py-1">
              <span className="flex w-full items-start justify-between">
                <span className="mt-[3px] [font-family:'Adamina',Helvetica] text-sm font-normal leading-[14px] text-[#1e1e2d]">
                  {t("settings.privacyPolicy")}
                </span>
                <ChevronRight className="h-6 w-6 text-[#1e1e2d]" aria-hidden="true" />
              </span>
              <span className="h-px w-full bg-[#707070]" />
            </span>
          </Button>
        </div>
      </section>

      <nav
        className="relative z-[1000] mt-auto flex h-[90px] w-full flex-col border-t-[0.5px] border-[#3c3c435c] bg-[#f9f9f9f0] backdrop-blur-[10px]"
        aria-label="Primary navigation"
      >
        <div className="grid h-[49px] grid-cols-4">
          {navigationItems.map(({ labelKey, Icon, path }) => {
            const isCurrent = labelKey === "nav.settings";
            return (
              <Button
                key={labelKey}
                type="button"
                variant="ghost"
                disabled={isCurrent}
                onClick={() => path && navigate(path)}
                aria-current={isCurrent ? "page" : undefined}
                className="h-[49px] flex-col justify-start rounded-none px-0 pt-[7px] text-[#7a4a4a] hover:bg-transparent hover:text-[#7a4a4a] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#7a4a4a]"
              >
                <Icon className="h-[25px] w-[25px]" aria-hidden="true" />
                <span className="mt-0.5 [font-family:'Adamina',Helvetica] text-[10px] font-normal leading-[normal] tracking-[-0.24px]">
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

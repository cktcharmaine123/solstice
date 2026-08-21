import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Home, Leaf, BarChart, Settings as Gear } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useLanguage } from "../../i18n/LanguageContext";
import { LANGUAGES, type Language } from "../../i18n/translations";

const navigationItems = [
  { labelKey: "nav.home" as const, Icon: Home, path: "/home" },
  { labelKey: "nav.locations" as const, Icon: Leaf, path: "/locations" },
  { labelKey: "nav.graphs" as const, Icon: BarChart, path: "/graphs" },
  { labelKey: "nav.settings" as const, Icon: Gear, path: "/settings" },
];

export const LanguageScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();

  const handleSelect = (code: Language) => {
    setLanguage(code);
  };

  return (
    <main className="app-container relative mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-white">
      <div className="px-7 pb-10 pt-11">
        <Button
          aria-label={t("analysis.goBack")}
          className="flex h-12 w-12 items-center justify-center p-0 text-[#1e1e2d] hover:bg-transparent hover:text-[#1e1e2d]"
          type="button"
          variant="ghost"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5 stroke-[2]" />
        </Button>
        <h1 className="mt-6 whitespace-nowrap [font-family:'Adamina',Helvetica] text-[37px] font-normal leading-[44px] text-[#7a4a4a]">
          {t("language.title")}
        </h1>
      </div>

      <section className="mx-auto w-[calc(100%-90px)] max-w-[342px] md:w-[calc(100%-120px)] md:max-w-[640px]" aria-labelledby="language-heading">
        <ul className="flex flex-col gap-[22px]">
          {LANGUAGES.map((lang) => {
            const isActive = language === lang.code;
            return (
              <li key={lang.code}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleSelect(lang.code)}
                  className="min-h-12 w-full rounded-none p-0 text-left font-normal hover:bg-transparent"
                >
                  <span className="flex min-h-12 w-full flex-col gap-[9.5px] py-1">
                    <span className="flex w-full items-center justify-between">
                      <span className="mt-[3px] [font-family:'Adamina',Helvetica] text-sm font-normal leading-[14px] text-[#1e1e2d]">
                        {lang.nativeLabel}
                      </span>
                      {isActive && <Check className="h-5 w-5 text-[#7a4a4a]" aria-hidden="true" />}
                    </span>
                    <span className="h-px w-full bg-[#707070]" />
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
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

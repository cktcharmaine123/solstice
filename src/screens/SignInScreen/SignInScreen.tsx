import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useLanguage } from "../../i18n/LanguageContext";

export const SignInScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <main className="app-container relative mx-auto min-h-[100dvh] w-full overflow-x-hidden bg-white">
      <header className="absolute left-1/2 top-[118px] -translate-x-1/2">
        <h1 className="text-center [font-family:'Adamina',Helvetica] text-2xl font-normal leading-9 tracking-[-0.24px] text-[#7a4a4a]">
          Solstice
        </h1>
      </header>
      <section className="absolute left-1/2 top-[calc(50%-28px)] flex w-full max-w-[375px] -translate-x-1/2 flex-col items-center gap-6 px-6">
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            navigate("/home");
          }}
        >
          <Button
            type="submit"
            className="min-h-12 w-full rounded-lg bg-[#7a4a4a] px-4 py-3 [font-family:'Adamina',Helvetica] text-sm font-normal leading-[19.6px] text-white hover:bg-[#7a4a4a]/90"
          >
            {t("signIn.continue")}
          </Button>
        </form>
        <p className="text-center [font-family:'Adamina',Helvetica] text-xs font-normal leading-[18px] text-black">
          {t("signIn.agreePrefix")}{" "}
          <button
            type="button"
            onClick={() => navigate("/privacy-policy")}
            className="min-h-12 text-[#7a4a4a] underline-offset-2 hover:underline"
          >
            {t("signIn.privacyPolicy")}
          </button>
        </p>
      </section>
    </main>
  );
};

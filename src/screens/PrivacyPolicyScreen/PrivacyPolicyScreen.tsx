import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useLanguage } from "../../i18n/LanguageContext";
import { privacyPolicyContent } from "../../i18n/translations";

export const PrivacyPolicyScreen = (): JSX.Element => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const content = privacyPolicyContent[language];

  return (
    <main className="app-container relative mx-auto min-h-[100dvh] w-full overflow-x-hidden bg-white">
      <div className="px-7 pb-10 pt-11">
        <Button
          aria-label="Go back"
          className="flex h-12 w-12 items-center justify-center p-0 text-[#1e1e2d] hover:bg-transparent hover:text-[#1e1e2d]"
          type="button"
          variant="ghost"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon aria-hidden="true" className="h-5 w-5 stroke-[2]" />
        </Button>
        <h1 className="mt-6 whitespace-nowrap [font-family:'Adamina',Helvetica] text-[37px] font-normal leading-[44px] text-[#7a4a4a]">
          {content.title}
        </h1>
      </div>
      <article className="mx-auto w-[calc(100%-90px)] max-w-[342px] [font-family:'Adamina',Helvetica] text-[10px] font-normal leading-[18px] text-[#1e1e2d] md:w-[calc(100%-120px)] md:max-w-[640px] md:text-sm md:leading-[26px]">
        {content.sections.map((section) => (
          <section key={section.title} className="mb-3">
            <p>{section.title}</p>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-1">{paragraph}</p>
            ))}

            {section.bullets && (
              <ul className="list-disc pl-[15px]">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="pl-0">
                    {bullet}
                  </li>
                ))}
              </ul>
            )}

            {section.trailingParagraph && <p className="mt-1">{section.trailingParagraph}</p>}
          </section>
        ))}
      </article>
    </main>
  );
};

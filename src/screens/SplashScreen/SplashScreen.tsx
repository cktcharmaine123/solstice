type SplashScreenProps = {
  isVisible: boolean;
};

export const SplashScreen = ({ isVisible }: SplashScreenProps): JSX.Element => (
  <div
    aria-label="Loading Solstice"
    aria-hidden={!isVisible}
    className={`fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-700 ease-out ${
      isVisible ? "opacity-100" : "pointer-events-none opacity-0"
    }`}
  >
    <div className="flex -translate-y-[3px] flex-col items-center">
      <h1 className="[font-family:'Adamina',Helvetica] text-[28px] font-normal leading-9 tracking-[-0.24px] text-[#7a4a4a]">
        Solstice
      </h1>
      <span className="mt-[165px] block h-10 w-10 animate-splash-spin rounded-full border-[5px] border-[#f7f1d8] border-t-[#7a4a4a]" />
    </div>
  </div>
);

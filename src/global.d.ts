declare global {
  interface Window {
    __hideAppLoading?: () => void;
    __fallbackTimer?: ReturnType<typeof setTimeout>;
  }
}

export {};

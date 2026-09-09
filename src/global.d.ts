declare global {
  interface Window {
    __hideAppLoading?: () => void;
    __appBooted?: boolean;
    __recoveryTimer?: ReturnType<typeof setTimeout>;
    __fallbackTimer?: ReturnType<typeof setTimeout>;
  }
}

export {};

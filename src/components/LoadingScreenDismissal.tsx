import { useEffect, type ReactNode } from "react";

export function LoadingScreenDismissal({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    if (typeof window.__hideAppLoading === "function") {
      window.__hideAppLoading();
    }
  }, []);

  return <>{children}</>;
}

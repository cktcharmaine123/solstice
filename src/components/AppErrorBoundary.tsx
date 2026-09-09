import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("App crashed:", error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            fontFamily: "Inter, Helvetica, sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "Adamina, Helvetica, serif",
              fontSize: "28px",
              fontWeight: 400,
              color: "#7a4a4a",
              margin: "0 0 16px",
            }}
          >
            Solstice
          </h1>
          <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.5, maxWidth: "320px", margin: "0 0 24px" }}>
            Something went wrong while loading the app. Please refresh the page to try again.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              fontFamily: "Inter, Helvetica, sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              color: "#ffffff",
              background: "#7a4a4a",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              cursor: "pointer",
            }}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

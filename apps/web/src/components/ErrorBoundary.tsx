import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrandMark } from "./BrandMark.js";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="center-page">
        <BrandMark />
        <h1>Something went wrong</h1>
        <p>An unexpected error stopped this page from loading. Your documents are safe. Reloading usually fixes it.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </main>
    );
  }
}

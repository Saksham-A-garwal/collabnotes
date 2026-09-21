import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { AuthProvider } from "./hooks/useAuth.js";
import DashboardPage from "./pages/DashboardPage.js";
import { loadEditorPage } from "./pages/editorPageLoader.js";
import GoogleCallbackPage from "./pages/GoogleCallbackPage.js";
import LoginPage from "./pages/LoginPage.js";
import NotFoundPage from "./pages/NotFoundPage.js";
import ShareRedeemPage from "./pages/ShareRedeemPage.js";

const EditorPage = lazy(loadEditorPage);

function RouteFallback() {
  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "var(--space-xl)" }} id="main">
      <p style={{ color: "var(--text-secondary)" }} role="status">
        Loading…
      </p>
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/oauth/google/callback" element={<GoogleCallbackPage />} />
              <Route path="/share/:token" element={<ShareRedeemPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents/:id"
                element={
                  <ProtectedRoute>
                    <EditorPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

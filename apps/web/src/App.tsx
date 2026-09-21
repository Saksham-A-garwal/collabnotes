import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { AuthProvider } from "./hooks/useAuth.js";
import DashboardPage from "./pages/DashboardPage.js";
import { loadEditorPage } from "./pages/editorPageLoader.js";
import GoogleCallbackPage from "./pages/GoogleCallbackPage.js";
import LoginPage from "./pages/LoginPage.js";
import ShareRedeemPage from "./pages/ShareRedeemPage.js";

const EditorPage = lazy(loadEditorPage);

function RouteFallback() {
  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "var(--space-xl)" }}>
      <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
    </main>
  );
}

export default function App() {
  return (
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

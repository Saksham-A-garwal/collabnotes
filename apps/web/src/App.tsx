import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { AuthProvider } from "./hooks/useAuth.js";
import DashboardPage from "./pages/DashboardPage.js";
import GoogleCallbackPage from "./pages/GoogleCallbackPage.js";
import LoginPage from "./pages/LoginPage.js";

// The Editor lands in Phase 2 (Yjs/Tiptap sync core) — a placeholder keeps
// routing/navigation real from Phase 1 onward.
function EditorPlaceholder() {
  return (
    <main style={{ padding: "var(--space-xl)" }}>
      <h1 style={{ fontSize: "var(--text-lg)" }}>Editor</h1>
      <p style={{ color: "var(--text-secondary)" }}>Coming in Phase 2 (realtime sync core).</p>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth/google/callback" element={<GoogleCallbackPage />} />
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
                <EditorPlaceholder />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

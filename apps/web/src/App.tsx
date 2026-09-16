import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Screens land in Phase 1 (auth + dashboard) and Phase 2 (editor) per the
// Development Plan. This shell exists so `npm run dev` boots a real app
// from Phase 0 onward.
function Placeholder({ label }: { label: string }) {
  return (
    <main style={{ padding: "var(--space-xl)" }}>
      <h1 style={{ fontSize: "var(--text-lg)" }}>CollabNotes</h1>
      <p style={{ color: "var(--text-secondary)" }}>{label} — coming in a later phase.</p>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Placeholder label="Login / Register" />} />
        <Route path="/" element={<Placeholder label="Dashboard" />} />
        <Route path="/documents/:id" element={<Placeholder label="Editor" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

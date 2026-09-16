import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { sharingApi } from "../lib/sharingApi.js";

// FR-21/FR-22: unauthenticated visitors are sent to log in and resume here;
// a revoked or malformed link gets its own clear state (UIUX §8), never a
// generic 404/500.
export default function ShareRedeemPage() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || attempted.current) return;
    attempted.current = true;

    sharingApi
      .redeem(token!)
      .then(({ document }) => navigate(`/documents/${document.id}`, { replace: true }))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "This link is no longer valid.");
      });
  }, [isAuthenticated, token, navigate]);

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`/share/${token}`)}`} replace />;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-md)",
        padding: "var(--space-lg)",
      }}
    >
      {error ? (
        <>
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/", { replace: true })}>
            Back to Dashboard
          </button>
        </>
      ) : (
        <p style={{ color: "var(--text-secondary)" }}>Joining document…</p>
      )}
    </main>
  );
}

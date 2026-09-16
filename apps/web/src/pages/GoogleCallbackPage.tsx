import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { ApiRequestError } from "../lib/apiClient.js";

// Target of GOOGLE_REDIRECT_URI (SRS FR-2): Google redirects here with
// ?code=..., which gets POSTed to /auth/oauth/google to complete sign-in.
export default function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const { loginWithGoogleCode } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = params.get("code");
    if (!code) {
      setError("Missing authorization code from Google.");
      return;
    }

    loginWithGoogleCode(code)
      .then(() => navigate("/", { replace: true }))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Google sign-in failed.");
      });
  }, [params, loginWithGoogleCode, navigate]);

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
          <button className="btn btn-primary" onClick={() => navigate("/login", { replace: true })}>
            Back to sign in
          </button>
        </>
      ) : (
        <p style={{ color: "var(--text-secondary)" }}>Signing you in…</p>
      )}
    </main>
  );
}

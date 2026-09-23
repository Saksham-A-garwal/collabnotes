import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark } from "../components/BrandMark.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { consumeGoogleState } from "../lib/googleOAuth.js";

export default function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const { loginWithGoogleCode } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);
  useDocumentTitle("Signing you in");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (params.get("error")) {
      setError("Google sign-in was cancelled.");
      return;
    }

    const pending = consumeGoogleState(params.get("state"));
    if (!pending) {
      setError("That sign-in link isn't valid or has expired. Please try again.");
      return;
    }

    const code = params.get("code");
    if (!code) {
      setError("Missing authorization code from Google.");
      return;
    }

    loginWithGoogleCode(code)
      .then(() => navigate(pending.redirect, { replace: true }))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Google sign-in failed.");
      });
  }, [params, loginWithGoogleCode, navigate]);

  return (
    <main className="center-page" id="main">
      <BrandMark />
      {error ? (
        <>
          <h1>Couldn&rsquo;t sign you in</h1>
          <p role="alert">{error}</p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/login", { replace: true })}>
            Back to sign in
          </button>
        </>
      ) : (
        <p role="status">Signing you in…</p>
      )}
    </main>
  );
}

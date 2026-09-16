import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { ApiRequestError } from "../lib/apiClient.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
  return null;
}

function validatePassword(value: string, mode: "login" | "register"): string | null {
  if (mode === "login") return value.length === 0 ? "Enter your password." : null;
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "Password must contain a letter and a digit.";
  }
  return null;
}

// Login/Register combined screen with mode toggle, per 04-UIUX.md §3.1.
export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  // Only accept an in-app relative path — a bare "/" is safe, but "//evil"
  // or "https://evil" is browser-navigation-ambiguous, so reject anything
  // that doesn't look like a single leading-slash path.
  const redirectTo = rawRedirect && /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : "/";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validatePassword(password, mode) : null;
  const displayNameError =
    mode === "register" && touched.displayName && displayName.trim().length === 0
      ? "Enter your name."
      : null;

  // Disabled until required fields are non-empty — not until fully valid,
  // so the button doesn't hide *why* it won't work (UIUX §7).
  const canSubmit =
    email.length > 0 && password.length > 0 && (mode === "login" || displayName.length > 0);

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setTouched({ email: true, password: true, displayName: true });

    if (validateEmail(email) || validatePassword(password, mode)) return;
    if (mode === "register" && displayName.trim().length === 0) return;

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName.trim());
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleSignIn() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      setSubmitError("Google sign-in isn't configured yet.");
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-lg)",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 400 }}>
        <h1 style={{ fontSize: "var(--text-lg)", marginTop: 0 }}>CollabNotes</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 0, fontSize: "var(--text-sm)" }}>
          {mode === "login" ? "Sign in to continue." : "Create an account to get started."}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="displayName">Name</label>
              <input
                id="displayName"
                className="input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => markTouched("displayName")}
                aria-invalid={Boolean(displayNameError)}
                aria-describedby={displayNameError ? "displayName-error" : undefined}
              />
              {displayNameError && (
                <span id="displayName-error" className="field-error">
                  {displayNameError}
                </span>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => markTouched("email")}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <span id="email-error" className="field-error">
                {emailError}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                className="input"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => markTouched("password")}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? "password-error" : undefined}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {passwordError && (
              <span id="password-error" className="field-error">
                {passwordError}
              </span>
            )}
          </div>

          {submitError && (
            <p role="alert" className="field-error" style={{ marginTop: 0 }}>
              {submitError}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            margin: "var(--space-lg) 0",
            color: "var(--text-secondary)",
            fontSize: "var(--text-xs)",
          }}
        >
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--text-secondary)" }} />
          or
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--text-secondary)" }} />
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={handleGoogleSignIn}
        >
          Continue with Google
        </button>

        <p style={{ textAlign: "center", marginTop: "var(--space-lg)", fontSize: "var(--text-sm)" }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setSubmitError(null);
              setTouched({});
            }}
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}

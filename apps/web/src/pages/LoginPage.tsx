import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/BrandMark.js";
import { ChevronLeftIcon, GoogleIcon } from "../components/Icons.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { beginGoogleSignIn } from "../lib/googleOAuth.js";
import { safeRedirectPath } from "../lib/safeRedirect.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "code" | "name";

const errorMessage = (err: unknown): string =>
  err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.";

// One passwordless flow for both signing in and signing up (04-UIUX.md §3.1):
//   email -> 6-digit code from that inbox -> (new accounts only) your name.
// Nothing here reveals whether an address already has an account.
export default function LoginPage() {
  const { isAuthenticated, user, requestCode, verifyCode, updateDisplayName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get("redirect"));

  // Someone who arrives already signed in goes straight on. Captured once at
  // mount: verifying a code flips isAuthenticated mid-flow, and that must not
  // yank a brand-new user past the name step.
  const [alreadySignedIn] = useState(isAuthenticated);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const submittedCode = useRef<string | null>(null);

  useDocumentTitle(step === "email" ? "Log in" : step === "code" ? "Check your email" : "Welcome");

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  if (alreadySignedIn) return <Navigate to={redirectTo} replace />;

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await requestCode(address);
      setResendIn(res.resendAfterSeconds);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setEmail(address);
    if (await sendCode(address)) {
      setCode("");
      submittedCode.current = null;
      setStep("code");
    }
  }

  async function submitCode(value: string) {
    if (busy || submittedCode.current === value) return;
    submittedCode.current = value;
    setBusy(true);
    setError(null);
    try {
      const { isNewUser } = await verifyCode(email, value);
      if (isNewUser) {
        setName("");
        setStep("name");
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      submittedCode.current = null;
    } finally {
      setBusy(false);
    }
  }

  function handleCodeChange(raw: string) {
    // Accept a paste like "123 456"; keep digits only, max six.
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === 6) void submitCode(digits);
  }

  async function handleResend() {
    setNotice(null);
    if (await sendCode(email)) {
      setCode("");
      submittedCode.current = null;
      setNotice(`We sent a new code to ${email}.`);
    }
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      navigate(redirectTo, { replace: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateDisplayName(trimmed);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleGoogle() {
    const failure = beginGoogleSignIn(redirectTo);
    if (failure) setError(failure);
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
  }

  return (
    <main className="auth-page" id="main">
      <div className="auth-panel">
        <Brand />

        {step === "email" && (
          <>
            <h1 className="auth-title">Log in or sign up</h1>
            <p className="auth-sub">Write and edit together, in real time.</p>

            <button type="button" className="btn btn-secondary btn-lg btn-block google-btn" onClick={handleGoogle}>
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="divider" role="separator">
              <span>or</span>
            </div>

            <form onSubmit={handleEmailSubmit} noValidate>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "auth-error" : undefined}
                />
                {error && (
                  <span id="auth-error" role="alert" className="field-error">
                    {error}
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || email.trim().length === 0}>
                {busy ? "Sending code…" : "Continue"}
              </button>
            </form>

            <p className="auth-footnote">No password needed. We&rsquo;ll email you a 6-digit code to confirm it&rsquo;s you.</p>
          </>
        )}

        {step === "code" && (
          <>
            <button type="button" className="auth-back" onClick={backToEmail}>
              <ChevronLeftIcon />
              Use a different email
            </button>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void submitCode(code); }} noValidate>
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  className="input code-input"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={12}
                  autoFocus
                  placeholder="······"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  readOnly={busy}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "auth-error" : undefined}
                />
                {error && (
                  <span id="auth-error" role="alert" className="field-error">
                    {error}
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Continue"}
              </button>
            </form>

            <div className="resend-row">
              <span role="status">{notice ?? (resendIn > 0 ? `You can request a new code in ${resendIn}s` : "Didn’t get it? Check spam, or")}</span>
              <button type="button" className="link-button" onClick={handleResend} disabled={busy || resendIn > 0}>
                Resend code
              </button>
            </div>
          </>
        )}

        {step === "name" && (
          <>
            <h1 className="auth-title">Welcome! What should we call you?</h1>
            <p className="auth-sub">This is the name collaborators will see next to your cursor.</p>
            <form onSubmit={handleNameSubmit} noValidate>
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="input"
                  name="name"
                  autoComplete="name"
                  autoFocus
                  maxLength={80}
                  placeholder={user?.displayName ?? "Your name"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "auth-error" : undefined}
                />
                {error && (
                  <span id="auth-error" role="alert" className="field-error">
                    {error}
                  </span>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
                {name.trim() ? "Continue" : `Continue as ${user?.displayName ?? "you"}`}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

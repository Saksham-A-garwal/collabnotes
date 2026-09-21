import { safeRedirectPath } from "./safeRedirect.js";

// The `state` parameter is what stops login CSRF: without it, an attacker can
// start a Google sign-in with *their* account, then trick a victim's browser
// into completing it (a link to /oauth/google/callback?code=<attacker's code>)
// — silently signing the victim in as the attacker, where anything they type is
// then visible to the attacker. We generate an unguessable value, keep it in
// this tab's sessionStorage, and refuse any callback that doesn't echo it back.
const KEY = "collabnotes.oauthState";

type Pending = { state: string; redirect: string };

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Starts the redirect to Google. Returns an error message if it can't start.
export function beginGoogleSignIn(redirectAfter: string): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return "Google sign-in isn't configured yet.";

  const state = randomState();
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ state, redirect: safeRedirectPath(redirectAfter) } satisfies Pending));
  } catch {
    return "Your browser is blocking storage, which Google sign-in needs.";
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return null;
}

// Validates and *consumes* the state (single use). Null means the callback is
// not one we started, and must be rejected.
export function consumeGoogleState(returned: string | null): { redirect: string } | null {
  let pending: Pending | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    pending = raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
  if (!pending || !returned || returned !== pending.state) return null;
  return { redirect: safeRedirectPath(pending.redirect) };
}

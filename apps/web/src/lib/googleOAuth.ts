import { safeRedirectPath } from "./safeRedirect.js";

const KEY = "collabnotes.oauthState";

type Pending = { state: string; redirect: string };

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

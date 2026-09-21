import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // Signed out: go to sign-in, and come back to exactly this page afterwards.
  // That is what makes the link in an invitation email land on the document.
  // (LoginPage re-validates the value before using it.)
  if (!isAuthenticated) {
    const back = location.pathname + location.search;
    const to = back === "/" ? "/login" : `/login?redirect=${encodeURIComponent(back)}`;
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}

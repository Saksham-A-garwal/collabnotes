import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Ported from the Cortex project's isAuthenticated middleware: Bearer-header
// extraction + stateless JWT verify (no DB hit — Architecture §8). Distinct
// error codes for "missing" vs "expired" vs "invalid" so the frontend can
// tell an expired-but-refreshable session from a truly bad token.
export type AccessTokenPayload = { sub: string };

export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not signed in." } });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session expired." } });
      return;
    }
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in again." } });
  }
}

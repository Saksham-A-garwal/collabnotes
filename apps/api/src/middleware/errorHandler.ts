import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@collabnotes/shared";

// Central error-handling middleware: uncaught exceptions never leak
// internals to the client (SRS §8, §9.2 A10).
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toEnvelope());
    return;
  }

  // A still-valid access token (stateless JWT, Architecture §8) whose user
  // row no longer exists trips a foreign-key violation on the first write
  // that references it — treat that as "please sign in again", not a raw
  // 500 leaking a Postgres constraint name.
  if ((err as { code?: string })?.code === "23503") {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in again." } });
    return;
  }

  console.error(JSON.stringify({ level: "error", message: (err as Error)?.message, stack: (err as Error)?.stack }));
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
}

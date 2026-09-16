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

  console.error(JSON.stringify({ level: "error", message: (err as Error)?.message, stack: (err as Error)?.stack }));
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
}

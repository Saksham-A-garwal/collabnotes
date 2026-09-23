import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@collabnotes/shared";

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

  if ((err as { code?: string })?.code === "23503") {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in again." } });
    return;
  }

  const clientStatus = (err as { status?: number; expose?: boolean })?.status;
  if (typeof clientStatus === "number" && clientStatus >= 400 && clientStatus < 500) {
    const message = clientStatus === 413 ? "Request body too large." : "Bad request.";
    res.status(clientStatus).json({ error: { code: "VALIDATION_ERROR", message } });
    return;
  }

  console.error(JSON.stringify({ level: "error", message: (err as Error)?.message, stack: (err as Error)?.stack }));
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
}

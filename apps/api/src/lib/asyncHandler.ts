import type { NextFunction, Request, Response } from "express";

// Express 4 doesn't forward rejected promises to error middleware on its
// own; wrap async handlers so a thrown ApiError reaches errorHandler.ts.
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

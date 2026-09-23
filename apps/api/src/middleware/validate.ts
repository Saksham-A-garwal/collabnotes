import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type Schemas = Partial<Record<"body" | "params" | "query", ZodTypeAny>>;

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        const first = result.error.issues[0];
        const path = first?.path.join(".") || key;
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid ${key}: ${path} — ${first?.message ?? "validation failed"}`,
          },
        });
        return;
      }

      Object.defineProperty(req, key, {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  };
}

import { z } from "zod";

export const documentIdParamSchema = z.object({ id: z.string().uuid() });

export const restoreParamSchema = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

import { z } from "zod";

const shareRole = z.enum(["editor", "viewer"]); // SRS §7: never "owner" via this endpoint
const email = z.string().trim().toLowerCase().pipe(z.string().email("Must be a valid email address."));

export const documentIdParamSchema = z.object({ id: z.string().uuid() });

export const inviteSchema = z.object({ email, role: shareRole });
export const createLinkSchema = z.object({ role: shareRole });

export const linkParamSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(1),
});

export const accessParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const pendingInviteParamSchema = z.object({
  id: z.string().uuid(),
  email,
});

export const redeemParamSchema = z.object({ token: z.string().min(1) });

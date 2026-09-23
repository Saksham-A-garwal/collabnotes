import { Router } from "express";
import type { NotificationsResponse } from "@collabnotes/shared";
import { z } from "zod";
import { countUnread, listNotifications, markAllRead, markRead } from "../../db/queries/notifications.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { authGuard } from "../../middleware/authGuard.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";

export const notificationsRouter = Router();
notificationsRouter.use(authGuard);

const readLimit = rateLimit({ keyPrefix: "notifications-read", windowSeconds: 60, max: 120, keyBy: (req) => req.userId ?? "anonymous", message: "Too many requests." });

const LIST_LIMIT = 30;

notificationsRouter.get(
  "/",
  readLimit,
  asyncHandler(async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([listNotifications(req.userId!, LIST_LIMIT), countUnread(req.userId!)]);
    const body: NotificationsResponse = { notifications, unreadCount };
    res.status(200).json(body);
  }),
);

notificationsRouter.get(
  "/unread-count",
  readLimit,
  asyncHandler(async (req, res) => {
    res.status(200).json({ unreadCount: await countUnread(req.userId!) });
  }),
);

notificationsRouter.post(
  "/read-all",
  readLimit,
  asyncHandler(async (req, res) => {
    await markAllRead(req.userId!);
    res.status(204).send();
  }),
);

notificationsRouter.post(
  "/:id/read",
  readLimit,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await markRead(req.userId!, req.params.id!);
    res.status(204).send();
  }),
);

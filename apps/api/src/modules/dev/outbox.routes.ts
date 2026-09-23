import { Router } from "express";
import { latestOutboxEmail } from "../auth/email/mailer.js";

export const devOutboxRouter = Router();

devOutboxRouter.get("/outbox", (req, res) => {
  const to = String(req.query["to"] ?? "").trim().toLowerCase();
  const mail = latestOutboxEmail(to);
  if (!mail) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No email for that address." } });
    return;
  }
  res.json({ subject: mail.subject, text: mail.text, code: /\b(\d{6})\b/.exec(mail.text)?.[1] ?? null });
});

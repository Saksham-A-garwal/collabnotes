import { Router } from "express";
import { latestOutboxEmail } from "../auth/email/mailer.js";

// Lets the E2E suite read the sign-in code it "received". app.ts mounts this
// only when EMAIL_TRANSPORT=outbox, and env.ts refuses that setting in
// production — so it cannot exist on a real deployment.
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

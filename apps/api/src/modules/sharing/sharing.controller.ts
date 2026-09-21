import type { Request, Response } from "express";
import type { InviteResponse } from "@collabnotes/shared";
import {
  cancelPendingInvite,
  createLink,
  inviteByEmail,
  listAccessForOwner,
  redeemShareLink,
  removeCollaborator,
  revokeLink,
} from "./sharing.service.js";

export async function handleListAccess(req: Request, res: Response): Promise<void> {
  const collaborators = await listAccessForOwner(req.params.id!, req.userId!);
  res.status(200).json({ collaborators });
}

export async function handleInvite(req: Request, res: Response): Promise<void> {
  const { entry, notification } = await inviteByEmail(req.params.id!, req.userId!, req.body.email, req.body.role, {
    notify: req.body.notify,
  });
  const body: InviteResponse = { access: entry, notification };
  res.status(201).json(body);
}

export async function handleCreateLink(req: Request, res: Response): Promise<void> {
  const link = await createLink(req.params.id!, req.userId!, req.body.role);
  res.status(201).json(link);
}

export async function handleRevokeLink(req: Request, res: Response): Promise<void> {
  await revokeLink(req.params.id!, req.userId!, req.params.token!);
  res.status(204).send();
}

export async function handleRemoveAccess(req: Request, res: Response): Promise<void> {
  await removeCollaborator(req.params.id!, req.userId!, req.params.userId!);
  res.status(204).send();
}

export async function handleCancelPendingInvite(req: Request, res: Response): Promise<void> {
  await cancelPendingInvite(req.params.id!, req.userId!, req.params.email!);
  res.status(204).send();
}

export async function handleRedeemShareLink(req: Request, res: Response): Promise<void> {
  const document = await redeemShareLink(req.params.token!, req.userId!);
  res.status(200).json({ document });
}

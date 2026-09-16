import type { Request, Response } from "express";
import { listSnapshotsForUser, restoreSnapshotForUser } from "./snapshots.service.js";

export async function handleListSnapshots(req: Request, res: Response): Promise<void> {
  const snapshots = await listSnapshotsForUser(req.params.id!, req.userId!);
  res.status(200).json({ snapshots });
}

export async function handleRestoreSnapshot(req: Request, res: Response): Promise<void> {
  const document = await restoreSnapshotForUser(req.params.id!, req.userId!, req.params.snapshotId!);
  res.status(200).json({ document });
}

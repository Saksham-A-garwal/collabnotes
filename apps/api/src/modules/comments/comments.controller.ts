import type { Request, Response } from "express";
import type { CommentsResponse, PeopleResponse } from "@collabnotes/shared";
import {
  createComment,
  editComment,
  listComments,
  listMentionable,
  removeComment,
  removeThread,
  replyToThread,
  setResolved,
} from "./comments.service.js";

// Every mutation answers with the thread as it now stands, so the caller can just
// replace its copy — the same thing other viewers receive over the socket.

export async function handleListComments(req: Request, res: Response): Promise<void> {
  const body: CommentsResponse = { threads: await listComments(req.params.id!, req.userId!) };
  res.status(200).json(body);
}

export async function handleListPeople(req: Request, res: Response): Promise<void> {
  const body: PeopleResponse = { people: await listMentionable(req.params.id!, req.userId!) };
  res.status(200).json(body);
}

export async function handleCreateComment(req: Request, res: Response): Promise<void> {
  const { quote, anchor, body, mentions } = req.body;
  const thread = await createComment(req.params.id!, req.userId!, { quote, anchor: anchor ?? null, body, mentions });
  res.status(201).json({ thread });
}

export async function handleReply(req: Request, res: Response): Promise<void> {
  const thread = await replyToThread(req.params.id!, req.userId!, req.params.threadId!, req.body.body, req.body.mentions);
  res.status(201).json({ thread });
}

export async function handleResolve(req: Request, res: Response): Promise<void> {
  const thread = await setResolved(req.params.id!, req.userId!, req.params.threadId!, req.body.resolved);
  res.status(200).json({ thread });
}

export async function handleEditComment(req: Request, res: Response): Promise<void> {
  const thread = await editComment(req.params.id!, req.userId!, req.params.threadId!, req.params.commentId!, req.body.body, req.body.mentions);
  res.status(200).json({ thread });
}

export async function handleDeleteComment(req: Request, res: Response): Promise<void> {
  const thread = await removeComment(req.params.id!, req.userId!, req.params.threadId!, req.params.commentId!);
  res.status(200).json({ thread });
}

export async function handleDeleteThread(req: Request, res: Response): Promise<void> {
  await removeThread(req.params.id!, req.userId!, req.params.threadId!);
  res.status(204).send();
}

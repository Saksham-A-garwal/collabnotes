import type { Request, Response } from "express";
import type { DocumentSummary, SearchResponse } from "@collabnotes/shared";
import { toDocumentDetail, toDocumentSummary } from "../../db/queries/documents.js";
import { searchDocuments } from "./search.service.js";
import {
  createDocumentForUser,
  deleteDocumentForUser,
  getDocumentForUser,
  listDocuments,
  renameDocumentForUser,
} from "./documents.service.js";

export async function handleListDocuments(req: Request, res: Response): Promise<void> {
  const rows = await listDocuments(req.userId!);
  const documents: DocumentSummary[] = rows.map((row) => toDocumentSummary(row, row.role));
  res.status(200).json({ documents });
}

export async function handleSearchDocuments(req: Request, res: Response): Promise<void> {
  // validate() has already parsed and defaulted these.
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  const body: SearchResponse = { results: await searchDocuments(req.userId!, q, limit) };
  res.status(200).json(body);
}

export async function handleCreateDocument(req: Request, res: Response): Promise<void> {
  const doc = await createDocumentForUser(req.userId!, req.body.title);
  res.status(201).json({ document: toDocumentSummary(doc, "owner") });
}

export async function handleGetDocument(req: Request, res: Response): Promise<void> {
  const { doc, role } = await getDocumentForUser(req.params.id!, req.userId!);
  res.status(200).json({ document: toDocumentDetail(doc, role), role });
}

export async function handleRenameDocument(req: Request, res: Response): Promise<void> {
  const doc = await renameDocumentForUser(req.params.id!, req.userId!, req.body.title);
  res.status(200).json({ document: toDocumentSummary(doc, "owner") });
}

export async function handleDeleteDocument(req: Request, res: Response): Promise<void> {
  await deleteDocumentForUser(req.params.id!, req.userId!);
  res.status(204).send();
}

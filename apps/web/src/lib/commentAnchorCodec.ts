import * as Y from "yjs";

// Comment anchors arrive from the server as JSON that another user (or a script)
// could have written, so they're checked before Yjs ever sees them. The dangerous case
// is `tname`: resolving a position whose type name isn't in the document makes Yjs
// *create* a root type of that name in the local document. Only the editor's own
// fragment name is accepted, and ids must be plain numbers.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isClock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function readId(v: unknown): { client: number; clock: number } | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isRecord(v) || !isClock(v.client) || !isClock(v.clock)) return undefined; // undefined = invalid
  return { client: v.client, clock: v.clock };
}

export function parseRelativePosition(json: unknown, fragmentName: string): Y.RelativePosition | null {
  if (!isRecord(json)) return null;

  const type = readId(json.type);
  const item = readId(json.item);
  if (type === undefined || item === undefined) return null;

  const tname = json.tname ?? null;
  if (tname !== null && tname !== fragmentName) return null;

  const assoc = json.assoc ?? 0;
  if (typeof assoc !== "number" || !Number.isFinite(assoc)) return null;

  // Nothing to point at: not a position.
  if (type === null && item === null && tname === null) return null;

  return Y.createRelativePositionFromJSON({
    type: type ? { client: type.client, clock: type.clock } : null,
    tname,
    item: item ? { client: item.client, clock: item.clock } : null,
    assoc,
  });
}

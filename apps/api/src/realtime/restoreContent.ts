import * as Y from "yjs";

// Tiptap's @tiptap/extension-collaboration default field name for the
// top-level shared type (Collaboration.configure({ document }) with no
// `field` override, which is what the frontend uses).
const CONTENT_FIELD = "default";

// Restoring a snapshot is *not* the same as merging its bytes into the
// live doc: Yjs CRDT merges are monotonic/additive, so applying an old
// state on top of a newer one via Y.applyUpdate would add the old content
// back without removing anything the newer state added — the document
// would get longer, not revert. Instead this clears the live document's
// content and re-inserts clones of the snapshot's nodes, as one
// transaction. Because that transaction is expressed as a normal Yjs
// update (real delete + insert operations, not just "new state"), the
// resulting delta can go through the exact same persist/relay pipeline as
// any other edit (FR-13) — every connected client's own `Y.applyUpdate`
// correctly tombstones the deleted content, no special-cased "replace the
// whole doc" event needed anywhere.
export function buildRestoreDelta(liveDoc: Y.Doc, snapshotBytes: Uint8Array): Uint8Array {
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, snapshotBytes);

  const live = liveDoc.getXmlFragment(CONTENT_FIELD);
  const snapshot = snapshotDoc.getXmlFragment(CONTENT_FIELD);

  // Tiptap only ever inserts XmlElement/XmlText nodes into this fragment —
  // XmlHook is a legacy Yjs type unreachable in practice here, but Y.XmlFragment#insert
  // doesn't accept it, so it's filtered out defensively rather than cast away.
  const clonedNodes = snapshot
    .toArray()
    .filter((item): item is Y.XmlElement | Y.XmlText => !(item instanceof Y.XmlHook))
    .map((item) => item.clone());

  const beforeState = Y.encodeStateVector(liveDoc);
  liveDoc.transact(() => {
    live.delete(0, live.length);
    live.insert(0, clonedNodes);
  });

  return Y.encodeStateAsUpdate(liveDoc, beforeState);
}

import * as Y from "yjs";

const CONTENT_FIELD = "default";

export function buildRestoreDelta(liveDoc: Y.Doc, snapshotBytes: Uint8Array): Uint8Array {
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, snapshotBytes);

  const live = liveDoc.getXmlFragment(CONTENT_FIELD);
  const snapshot = snapshotDoc.getXmlFragment(CONTENT_FIELD);

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

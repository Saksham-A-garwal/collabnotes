import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { COMMENT_QUOTE_MAX, type CommentAnchor } from "@collabnotes/shared";
import { parseRelativePosition } from "./commentAnchorCodec.js";

export type AnchorRange = { from: number; to: number };
export type AnchorThread = { id: string; anchor: CommentAnchor | null; resolved: boolean };

export type AnchorController = {
  threads: AnchorThread[];
  activeId: string | null;
  ranges: Map<string, AnchorRange | null>;
  onActivate: (threadId: string) => void;
  onRanges: (ranges: Map<string, AnchorRange | null>) => void;
};

export function createAnchorController(): AnchorController {
  return { threads: [], activeId: null, ranges: new Map(), onActivate: () => undefined, onRanges: () => undefined };
}

const FRAGMENT = "default";
const MAX_HIGHLIGHTED = 300;

export const anchorsKey = new PluginKey<number>("commentAnchors");

type SyncState = { binding: { type: Y.XmlFragment; doc: Y.Doc; mapping: Map<unknown, unknown> } | null; doc: Y.Doc };

function syncState(state: EditorState): SyncState | undefined {
  return ySyncPluginKey.getState(state) as SyncState | undefined;
}

export function resolveAnchor(state: EditorState, anchor: CommentAnchor | null): AnchorRange | null {
  const binding = syncState(state)?.binding;
  if (!binding || !anchor) return null;
  try {
    const a = parseRelativePosition(anchor.from, FRAGMENT);
    const b = parseRelativePosition(anchor.to, FRAGMENT);
    if (!a || !b) return null;
    const mapping = binding.mapping as never;
    const from = relativePositionToAbsolutePosition(binding.doc, binding.type, a, mapping);
    const to = relativePositionToAbsolutePosition(binding.doc, binding.type, b, mapping);
    if (from === null || to === null || from >= to || from < 0 || to > state.doc.content.size) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export function anchorFromSelection(state: EditorState): { anchor: CommentAnchor; quote: string } | null {
  const binding = syncState(state)?.binding;
  const { from, to, empty } = state.selection;
  if (!binding || empty) return null;
  const quote = state.doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim().slice(0, COMMENT_QUOTE_MAX);
  if (!quote) return null;
  const mapping = binding.mapping as never;
  const a = absolutePositionToRelativePosition(from, binding.type, mapping);
  const b = absolutePositionToRelativePosition(to, binding.type, mapping);
  return { anchor: { from: Y.relativePositionToJSON(a), to: Y.relativePositionToJSON(b) }, quote };
}

export function refreshAnchors(editor: Editor | null): void {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(anchorsKey, true));
}

export function scrollToAnchor(editor: Editor | null, controller: AnchorController, threadId: string): void {
  const range = controller.ranges.get(threadId);
  if (!editor || editor.isDestroyed || !range) return;
  const { node } = editor.view.domAtPos(range.from);
  const el = node instanceof Element ? node : node.parentElement;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
}

function sameRanges(a: Map<string, AnchorRange | null>, b: Map<string, AnchorRange | null>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, r] of a) {
    const o = b.get(id);
    if (o === undefined || (r === null) !== (o === null) || (r && o && (r.from !== o.from || r.to !== o.to))) return false;
  }
  return true;
}

export const CommentAnchors = Extension.create<{ getController: () => AnchorController }>({
  name: "commentAnchors",

  addOptions() {
    const fallback = createAnchorController();
    return { getController: () => fallback };
  },

  addProseMirrorPlugins() {
    const controller = this.options.getController();
    let cache: { doc: unknown; version: number; active: string | null; set: DecorationSet } | null = null;

    function decorate(state: EditorState): DecorationSet {
      const version = anchorsKey.getState(state) ?? 0;
      if (cache && cache.doc === state.doc && cache.version === version && cache.active === controller.activeId) return cache.set;

      const ranges = new Map<string, AnchorRange | null>();
      const decorations: Decoration[] = [];
      let highlighted = 0;
      for (const thread of controller.threads) {
        if (!thread.anchor) continue;
        if (thread.resolved || highlighted >= MAX_HIGHLIGHTED) {
          if (thread.resolved) ranges.set(thread.id, resolveAnchor(state, thread.anchor));
          continue;
        }
        const range = resolveAnchor(state, thread.anchor);
        ranges.set(thread.id, range);
        if (!range) continue;
        highlighted++;
        decorations.push(
          Decoration.inline(range.from, range.to, {
            class: thread.id === controller.activeId ? "comment-anchor is-active" : "comment-anchor",
            "data-thread-id": thread.id,
          }),
        );
      }

      const set = DecorationSet.create(state.doc, decorations);
      cache = { doc: state.doc, version, active: controller.activeId, set };
      if (!sameRanges(ranges, controller.ranges)) {
        controller.ranges = ranges;
        queueMicrotask(() => controller.onRanges(ranges));
      }
      return set;
    }

    return [
      new Plugin<number>({
        key: anchorsKey,
        state: {
          init: () => 0,
          apply: (tr, version) => (tr.getMeta(anchorsKey) ? version + 1 : version),
        },
        props: {
          decorations: decorate,
          handleClick(view, pos) {
            let best: { id: string; size: number } | null = null;
            for (const [id, range] of controller.ranges) {
              if (!range || pos < range.from || pos > range.to) continue;
              const thread = controller.threads.find((t) => t.id === id);
              if (!thread || thread.resolved) continue;
              const size = range.to - range.from;
              if (!best || size < best.size) best = { id, size };
            }
            if (best) controller.onActivate(best.id);
            void view;
            return false;
          },
        },
        view(view) {
          const ydoc = syncState(view.state)?.doc;
          let scheduled = false;
          const onUpdate = () => {
            if (scheduled || controller.threads.length === 0) return;
            scheduled = true;
            queueMicrotask(() => {
              scheduled = false;
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(anchorsKey, true));
            });
          };
          ydoc?.on("update", onUpdate);
          return { destroy: () => ydoc?.off("update", onUpdate) };
        },
      }),
    ];
  },
});

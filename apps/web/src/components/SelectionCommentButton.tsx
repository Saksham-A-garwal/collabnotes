import { useEffect, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { CommentIcon } from "./Icons.js";

export function SelectionCommentButton({ editor, onComment }: { editor: Editor | null; onComment: () => void }) {
  const selection = useEditorState({
    editor,
    selector: ({ editor: e }) => (e && !e.state.selection.empty ? { to: e.state.selection.to } : null),
  });
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor || !selection) {
      setPlace(null);
      return;
    }
    function measure() {
      if (!editor || editor.isDestroyed || !selection) return;
      try {
        const rect = editor.view.coordsAtPos(selection.to);
        const left = Math.min(Math.max(rect.left, 8), window.innerWidth - 120);
        setPlace({ top: rect.bottom + 8, left });
      } catch {
        setPlace(null);
      }
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editor, selection]);

  if (!selection || !place) return null;

  return (
    <button
      type="button"
      className="btn btn-primary selection-comment-btn"
      style={{ top: place.top, left: place.left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onComment}
    >
      <CommentIcon />
      Comment
    </button>
  );
}

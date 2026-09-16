import type { Editor } from "@tiptap/react";

// <Toolbar disabled editor /> — 04-UIUX.md §3.3: bold, italic, underline,
// heading dropdown, bullet/numbered lists, link. Disabled/hidden entirely
// for Viewer role. Icon-only buttons carry aria-label, not just a glyph
// (§10 accessibility: 4.1.2 Name, Role, Value).
export function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor || disabled) return null;

  const headingValue = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : "0";

  function setHeading(value: string) {
    if (!editor) return;
    if (value === "0") {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: Number(value) as 1 | 2 | 3 }).run();
    }
  }

  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div role="toolbar" aria-label="Formatting" className="editor-toolbar">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        className={editor.isActive("bold") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
        className={editor.isActive("italic") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={editor.isActive("underline")}
        className={editor.isActive("underline") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: "underline" }}>U</span>
      </button>

      <select
        aria-label="Heading level"
        className="toolbar-select"
        value={headingValue}
        onChange={(e) => setHeading(e.target.value)}
      >
        <option value="0">Normal</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
      </select>

      <button
        type="button"
        aria-label="Bullet list"
        aria-pressed={editor.isActive("bulletList")}
        className={editor.isActive("bulletList") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •≡
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        aria-pressed={editor.isActive("orderedList")}
        className={editor.isActive("orderedList") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1≡
      </button>
      <button
        type="button"
        aria-label="Link"
        aria-pressed={editor.isActive("link")}
        className={editor.isActive("link") ? "toolbar-btn active" : "toolbar-btn"}
        onClick={toggleLink}
      >
        🔗
      </button>
    </div>
  );
}

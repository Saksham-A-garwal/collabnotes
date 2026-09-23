import { useEditorState, type Editor } from "@tiptap/react";
import { CodeIcon, LinkIcon, ListIcon, OrderedListIcon, QuoteIcon, StrikeIcon } from "./Icons.js";

export function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      code: e?.isActive("code") ?? false,
      blockquote: e?.isActive("blockquote") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      link: e?.isActive("link") ?? false,
      heading: e?.isActive("heading", { level: 1 })
        ? "1"
        : e?.isActive("heading", { level: 2 })
          ? "2"
          : e?.isActive("heading", { level: 3 })
            ? "3"
            : "0",
    }),
  });

  if (!editor || !active || disabled) return null;

  const headingValue = active.heading;

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

  const btn = (pressed: boolean) => (pressed ? "toolbar-btn active" : "toolbar-btn");

  return (
    <div role="toolbar" aria-label="Formatting" className="editor-toolbar">
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

      <span className="toolbar-sep" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        <button type="button" aria-label="Bold" aria-pressed={active.bold} className={btn(active.bold)} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </button>
        <button type="button" aria-label="Italic" aria-pressed={active.italic} className={btn(active.italic)} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em style={{ fontFamily: "Georgia, serif" }}>I</em>
        </button>
        <button type="button" aria-label="Underline" aria-pressed={active.underline} className={btn(active.underline)} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>
        <button type="button" aria-label="Strikethrough" aria-pressed={active.strike} className={btn(active.strike)} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <StrikeIcon />
        </button>
        <button type="button" aria-label="Code" aria-pressed={active.code} className={btn(active.code)} onClick={() => editor.chain().focus().toggleCode().run()}>
          <CodeIcon />
        </button>
      </div>

      <span className="toolbar-sep" role="separator" aria-orientation="vertical" />

      <div className="toolbar-group">
        <button type="button" aria-label="Bullet list" aria-pressed={active.bulletList} className={btn(active.bulletList)} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListIcon />
        </button>
        <button type="button" aria-label="Numbered list" aria-pressed={active.orderedList} className={btn(active.orderedList)} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <OrderedListIcon />
        </button>
        <button type="button" aria-label="Quote" aria-pressed={active.blockquote} className={btn(active.blockquote)} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QuoteIcon />
        </button>
      </div>

      <span className="toolbar-sep" role="separator" aria-orientation="vertical" />

      <button type="button" aria-label="Link" aria-pressed={active.link} className={btn(active.link)} onClick={toggleLink}>
        <LinkIcon />
      </button>
    </div>
  );
}

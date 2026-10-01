import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import { useState } from 'react';

const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe'];
const TEXT_COLORS = ['#ef4444', '#f97316', '#16a34a', '#2563eb', '#9333ea', '#db2777'];

function Btn({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      className={`tb-btn ${active ? 'active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }) {
  const [pop, setPop] = useState(null); // 'hl' | 'color' | null
  if (!editor) return null;
  const c = () => editor.chain().focus();

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL (leave empty to remove)', prev);
    if (url === null) return;
    if (url === '') c().unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
  };

  return (
    <div className="toolbar">
      <Btn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title="Strike" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><s>S</s></Btn>
      <Btn title="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()}>{'</>'}</Btn>
      <span className="tb-sep" />
      <div className="tb-pop-wrap">
        <Btn title="Highlight" active={editor.isActive('highlight')} onClick={() => setPop(pop === 'hl' ? null : 'hl')}>🖍️</Btn>
        {pop === 'hl' && (
          <div className="tb-pop">
            {HIGHLIGHTS.map((col) => (
              <button key={col} type="button" className="swatch" style={{ background: col }} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { c().toggleHighlight({ color: col }).run(); setPop(null); }} />
            ))}
            <label className="swatch custom" title="Custom highlight">
              +<input type="color" onChange={(e) => c().setHighlight({ color: e.target.value }).run()} />
            </label>
            <button type="button" className="tb-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().unsetHighlight().run(); setPop(null); }}>✕</button>
          </div>
        )}
      </div>
      <div className="tb-pop-wrap">
        <Btn title="Text colour" onClick={() => setPop(pop === 'color' ? null : 'color')}>
          <span style={{ color: editor.getAttributes('textStyle').color || 'inherit', fontWeight: 700 }}>A</span>
        </Btn>
        {pop === 'color' && (
          <div className="tb-pop">
            {TEXT_COLORS.map((col) => (
              <button key={col} type="button" className="swatch" style={{ background: col }} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { c().setColor(col).run(); setPop(null); }} />
            ))}
            <label className="swatch custom" title="Custom colour">
              +<input type="color" onChange={(e) => c().setColor(e.target.value).run()} />
            </label>
            <button type="button" className="tb-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().unsetColor().run(); setPop(null); }}>✕</button>
          </div>
        )}
      </div>
      <span className="tb-sep" />
      <Btn title="Heading" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <Btn title="Sub-heading" active={editor.isActive('heading', { level: 4 })} onClick={() => c().toggleHeading({ level: 4 }).run()}>H4</Btn>
      <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>• ≡</Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>1.</Btn>
      <Btn title="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>❝</Btn>
      <Btn title="Link" active={editor.isActive('link')} onClick={setLink}>🔗</Btn>
      <span className="tb-sep" />
      <Btn title="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</Btn>
      {editor.isActive('table') && (
        <>
          <Btn title="Add row" onClick={() => c().addRowAfter().run()}>+row</Btn>
          <Btn title="Add column" onClick={() => c().addColumnAfter().run()}>+col</Btn>
          <Btn title="Delete row" onClick={() => c().deleteRow().run()}>-row</Btn>
          <Btn title="Delete column" onClick={() => c().deleteColumn().run()}>-col</Btn>
          <Btn title="Delete table" onClick={() => c().deleteTable().run()}>✕▦</Btn>
        </>
      )}
      <span className="tb-sep" />
      <Btn title="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}>⌫</Btn>
      <Btn title="Undo" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn title="Redo" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>↷</Btn>
    </div>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = 'Write here… select text to format it' }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  return (
    <div className="rte">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="rich prose" />
    </div>
  );
}

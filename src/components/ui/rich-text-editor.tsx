'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const HEADING_OPTIONS = [
  { label: 'Testo normale', value: '0' },
  { label: 'Titolo 1', value: '1' },
  { label: 'Titolo 2', value: '2' },
  { label: 'Titolo 3', value: '3' },
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Scrivi qui…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'pw-richtext focus:outline-none min-h-[120px] px-4 py-3 text-sm text-pw-text',
      },
    },
  });

  // Sincronizza cambi esterni (es. "Scrivi con AI") senza spostare il cursore
  // mentre l'utente digita.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      strike: editor?.isActive('strike') ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
      link: editor?.isActive('link') ?? false,
      heading: editor?.isActive('heading', { level: 1 })
        ? '1'
        : editor?.isActive('heading', { level: 2 })
          ? '2'
          : editor?.isActive('heading', { level: 3 })
            ? '3'
            : '0',
    }),
  });

  if (!editor) return null;

  const setHeading = (v: string) => {
    const chain = editor.chain().focus();
    if (v === '0') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
  };

  const toggleLink = () => {
    if (state?.link) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('Inserisci il link (https://…)');
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const Btn = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
        active ? 'bg-pw-accent/15 text-pw-accent' : 'text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text',
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-xl border border-pw-border bg-pw-surface-2 overflow-hidden focus-within:ring-2 focus-within:ring-pw-accent/30 focus-within:border-pw-accent/50 transition-all">
      <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-pw-border bg-pw-surface-3/40">
        <select
          value={state?.heading ?? '0'}
          onChange={(e) => setHeading(e.target.value)}
          className="h-8 rounded-lg border border-pw-border bg-pw-surface text-pw-text text-xs px-2 mr-1 outline-none focus:border-pw-accent/50 cursor-pointer"
          title="Stile testo"
        >
          {HEADING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Btn active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="Grassetto"><Bold size={15} /></Btn>
        <Btn active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="Corsivo"><Italic size={15} /></Btn>
        <Btn active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="Barrato"><Strikethrough size={15} /></Btn>
        <span className="w-px h-5 bg-pw-border mx-1" />
        <Btn active={state?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Elenco puntato"><List size={15} /></Btn>
        <Btn active={state?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Elenco numerato"><ListOrdered size={15} /></Btn>
        <span className="w-px h-5 bg-pw-border mx-1" />
        <Btn active={state?.link} onClick={toggleLink} title="Link"><Link2 size={15} /></Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

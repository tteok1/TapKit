import { useEffect, useState } from 'react';
import {
  Extension,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import { Image } from '@tiptap/extension-image';

export { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';

const trackedNodes = [
  'paragraph',
  'heading',
  'codeBlock',
  'bulletList',
  'orderedList',
  'table',
  'image',
];
const CanvasCell = TableCell.extend({ content: 'paragraph+' });
const CanvasHeader = TableHeader.extend({ content: 'paragraph+' });

function normalizeBlockIds(editor: Editor, newId: () => string) {
  const seen = new Set<string>();
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (!trackedNodes.includes(node.type.name)) return;
    const value: unknown = node.attrs.blockId;
    if (typeof value === 'string' && !seen.has(value)) {
      seen.add(value);
      return;
    }
    const blockId = newId();
    seen.add(blockId);
    transaction.setNodeMarkup(pos, undefined, { ...node.attrs, blockId });
  });
  if (transaction.docChanged)
    editor.view.dispatch(transaction.setMeta('addToHistory', false).setMeta('preventUpdate', true));
}

export function canvasExtensions(
  newId: () => string,
  imageData: (fileId: string, versionId: string) => Promise<string>,
) {
  function StaticImage({ node }: NodeViewProps) {
    const [data, setData] = useState<string>();
    const [failed, setFailed] = useState(false);
    const { fileId, versionId, alt } = node.attrs as {
      fileId: string;
      versionId: string;
      alt?: string;
    };
    useEffect(() => {
      let active = true;
      setData(undefined);
      setFailed(false);
      void imageData(fileId, versionId).then(
        (value) => {
          if (active) setData(value);
        },
        () => {
          if (active) setFailed(true);
        },
      );
      return () => {
        active = false;
      };
    }, [fileId, versionId]);
    return (
      <NodeViewWrapper contentEditable={false}>
        {data ? (
          <img src={'data:image/png;base64,' + data} alt={alt ?? '文档图片'} />
        ) : (
          <span>{failed ? '图片版本不可用' : '正在读取图片'}</span>
        )}
      </NodeViewWrapper>
    );
  }
  return [
    StarterKit.configure({
      blockquote: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: (value) => {
          try {
            const url = new URL(value);
            return /^https?:$/.test(url.protocol) && !url.username && !url.password;
          } catch {
            return false;
          }
        },
      },
    }),
    TableKit.configure({
      table: { resizable: false },
      tableCell: false,
      tableHeader: false,
    }),
    CanvasCell,
    CanvasHeader,
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          fileId: { default: null, rendered: false },
          versionId: { default: null, rendered: false },
        };
      },
      parseHTML() {
        return [];
      },
      addInputRules() {
        return [];
      },
      addNodeView() {
        return ReactNodeViewRenderer(StaticImage);
      },
    }),
    Extension.create({
      name: 'canvasBlockIds',
      addGlobalAttributes() {
        return [
          {
            types: trackedNodes,
            attributes: {
              blockId: {
                default: null,
                parseHTML: () => null,
                renderHTML: (attrs) => ({ 'data-block-id': attrs.blockId }),
              },
            },
          },
        ];
      },
      onCreate({ editor }) {
        normalizeBlockIds(editor, newId);
      },
      onUpdate({ editor }) {
        normalizeBlockIds(editor, newId);
      },
    }),
  ];
}

import { useEffect, useRef, useState } from 'react';
import { FileViewSchema, type ResourceRef } from '@tapkit/contracts';
import { chatFileOwner } from '../../src/chat-file-import';
import { requestOptions } from '../../src/desktop-state';
import { artifactCommand, useViewer, type ViewerAccess } from './state';
import t from '../../locales/viewer.zh-CN.json';
export function InlineFileCard({
  refValue,
  sessionId,
  index,
}: {
  refValue: Extract<ResourceRef, { kind: 'file' }>;
  sessionId: string;
  index: number;
}) {
  const viewer = useViewer(),
    [expanded, setExpanded] = useState(false),
    [name, setName] = useState(''),
    [excerpt, setExcerpt] = useState(''),
    [error, setError] = useState(''),
    [access, setAccess] = useState<ViewerAccess>();
  const key = JSON.stringify(refValue),
    sequence = useRef(0);
  useEffect(() => {
    if (!expanded) return;
    const ticket = ++sequence.current;
    void (async () => {
      const ref = JSON.parse(key) as typeof refValue,
        owner = await chatFileOwner(window.tapkit, ref, sessionId);
      const access = {
        fileId: ref.fileId,
        versionId: ref.versionId,
        ...(ref.locator ? { locator: ref.locator } : {}),
        ...(owner ? { owner } : {}),
      };
      const reply = await window.tapkit.fileCommand(requestOptions(), 'files.get', {
        fileId: ref.fileId,
        versionId: ref.versionId,
        ...(owner ? { owner } : {}),
      });
      if (!reply.ok) throw new Error(reply.error.code);
      if (!('file' in reply.data)) throw new Error('INTERNAL_ERROR');
      const file = FileViewSchema.parse(reply.data.file);
      if (ticket !== sequence.current) return;
      setAccess(access);
      setName(file.version.name + ' · v' + file.version.version);
      if (ref.selection && ref.locator) {
        const result = await artifactCommand('artifacts.selection', {
          ...access,
          expectedTextHash: ref.selection.selectedTextHash,
          ...(ref.selection.textRange ? { textRange: ref.selection.textRange } : {}),
        });
        if (ticket === sequence.current && 'selection' in result)
          setExcerpt(result.selection.selectedText.slice(0, 1000));
      } else {
        const result = await artifactCommand('artifacts.blocks', { ...access, limit: 3 });
        if (ticket === sequence.current && 'blocks' in result)
          setExcerpt(
            result.blocks
              .map((b) => b.text)
              .join('\n')
              .slice(0, 1000),
          );
      }
    })().catch(() => {
      if (ticket === sequence.current) setError(t.versionUnavailable);
    });
    return () => {
      sequence.current++;
    };
  }, [key, sessionId, expanded]);
  return (
    <details
      className="inline-file-card"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{name || t.inline + ' ' + index}</summary>
      {error && <p role="alert">{error}</p>}
      {excerpt && <pre>{excerpt}</pre>}
      <button
        disabled={!access}
        onClick={() => void viewer.open(access!).catch(() => setError(t.versionUnavailable))}
      >
        {t.expand}
      </button>
    </details>
  );
}

import { useEffect, useRef, useState } from 'react';

export function QuickInput({ onOpen }: { onOpen: (text: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function finish(open: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await window.tapkit.finishQuickInput(open);
      if (open) onOpen(text);
    } catch {
      setError('无法切换窗口，请重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="desktop-shell quick-input"
      data-theme="system"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          void finish(false);
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void finish(true);
        }}
      >
        <h1>快速输入</h1>
        <label>
          聊天草稿
          <textarea
            ref={input}
            rows={4}
            value={text}
            maxLength={100_000}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <p>在聊天中确认并发送。</p>
        <div className="action-group">
          <button disabled={busy} type="submit">
            在聊天中打开
          </button>
          <button disabled={busy} type="button" onClick={() => void finish(false)}>
            关闭
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}

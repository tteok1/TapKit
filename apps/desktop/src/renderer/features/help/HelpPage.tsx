import { useEffect, useRef, useState } from 'react';
import { Link } from '@tapkit/ui';
import { useDesktopPreferences } from '../settings/desktop-preferences';
import t from '../../locales/experience.zh-CN.json';

const repo = 'https://github.com/tteok1/TapKit';
const guides = [
  {
    title: '开始聊天或工作',
    text: '在首页选择聊天或工作。例如：对比我选中的两份资料，列出差异。输入内容后按发送；工作中的外部写入会先请求确认。',
    path: '/',
  },
  {
    title: '导入和预览资料',
    text: '在文件中导入本机资料，选择预览或下载原件。资料失效时重新导入，或在输入框移除旧引用再添加。',
    path: '/files',
  },
  {
    title: '连接模型与费用',
    text: '添加账户后检测模型能力。在模型与用量中可选择默认模型和查看本机预算。再次发送失败的请求可能产生额外费用。',
    path: '/settings/models',
  },
  {
    title: '恢复已删除内容',
    text: '在回收站检查可恢复的会话或文件；永久删除前先核对影响范围。',
    path: '/settings/trash',
  },
  {
    title: '处理未确认结果',
    text: '外部操作显示待核对时，先到原应用核对结果，再决定下一步。连接失败可保留草稿并更换账户或模型。',
    path: '/work',
  },
];

const shortcutNames = {
  search: '搜索',
  newTask: '新建聊天',
  newWindow: '新建窗口',
  quickInput: '全局快速输入',
};
export { shortcutNames };

async function prepareScreenshot(file: File) {
  if (file.size > 5_000_000 || !['image/png', 'image/jpeg'].includes(file.type)) throw Error();
  // Inspect only a bounded header before decoding the user-selected image.
  const bytes = new DataView(await file.slice(0, Math.min(file.size, 128_000)).arrayBuffer());
  let width = 0;
  let height = 0;
  if (
    file.type === 'image/png' &&
    bytes.byteLength >= 24 &&
    bytes.getUint32(0) === 0x89504e47 &&
    bytes.getUint32(4) === 0x0d0a1a0a &&
    bytes.getUint32(12) === 0x49484452
  ) {
    width = bytes.getUint32(16);
    height = bytes.getUint32(20);
  } else if (file.type === 'image/jpeg' && bytes.byteLength > 4 && bytes.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength && bytes.getUint8(offset) === 0xff) {
      const marker = bytes.getUint8(offset + 1);
      const length = bytes.getUint16(offset + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = bytes.getUint16(offset + 5);
        width = bytes.getUint16(offset + 7);
        break;
      }
      if (length < 2 || marker === 0xda) break;
      offset += 2 + length;
    }
  }
  if (!width || !height || width * height > 16_000_000) throw Error();
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}

export function HelpPage({ ready, accounts }: { ready: boolean; accounts: string }) {
  const prefs = useDesktopPreferences();
  const [query, setQuery] = useState('');
  const [environment, setEnvironment] =
    useState<Awaited<ReturnType<typeof window.tapkit.desktopEnvironment>>>();
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [includeDiagnostic, setIncludeDiagnostic] = useState(prefs.includeSupportDiagnostics);
  const [includeSnippet, setIncludeSnippet] = useState(false);
  const [snippet, setSnippet] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const imageRequest = useRef(0);

  useEffect(() => {
    let current = true;
    void window.tapkit
      .desktopEnvironment()
      .then((value) => {
        if (current) setEnvironment(value);
      })
      .catch(() => {
        if (current) setMetadataFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);

  const diagnostic = environment
    ? [
        'TapKit ' + environment.version,
        'Electron ' + environment.electron,
        '平台 ' + environment.platform,
        environment.packaged ? '打包版本' : '开发构建',
        '本地核心 ' + (ready ? '可用' : '待连接'),
        '模型账户 ' + accounts,
      ].join('\n')
    : '';
  const visible = guides.filter((guide) =>
    (guide.title + guide.text).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const open = (url: string) =>
    void window.tapkit.openPublicLink(url).catch(() => setNotice('无法打开浏览器，请稍后重试。'));
  async function save() {
    setBusy(true);
    setNotice('');
    try {
      const excerpt = includeSnippet ? snippet.trim() : '';
      const saved = await window.tapkit.saveConversation({
        name: 'TapKit-feedback.md',
        text:
          '# TapKit 反馈附件\n' +
          (includeDiagnostic && diagnostic ? '\n## 诊断\n\n' + diagnostic + '\n' : '') +
          (excerpt
            ? '\n## 选定片段\n\n' +
              excerpt
                .split('\n')
                .map((line) => '    ' + line)
                .join('\n') +
              '\n'
            : '') +
          (screenshot ? '\n## 截图\n\n![用户选定截图](' + screenshot + ')\n' : ''),
      });
      setNotice(saved ? '已保存反馈附件。' : '已取消保存。');
    } catch {
      setNotice('保存失败。请选择其他文件名或位置后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="experience-page help-page" aria-labelledby="help-title">
      <h1 id="help-title">{t.help}</h1>
      <label>
        搜索帮助 <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {visible.length ? (
        <ul className="help-guides">
          {visible.map((guide) => (
            <li key={guide.title}>
              <h2>{guide.title}</h2>
              <p>{guide.text}</p>
              <Link to={guide.path}>打开{guide.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">没有匹配的帮助。试试「模型」「文件」或「恢复」。</p>
      )}
      <h2>快捷键</h2>
      <dl className="feature-list">
        {Object.entries(prefs.shortcuts).map(([key, value]) => (
          <div key={key}>
            <dt>{shortcutNames[key as keyof typeof shortcutNames]}</dt>
            <dd>
              <kbd>{value}</kbd>
            </dd>
          </div>
        ))}
        <div>
          <dt>发送</dt>
          <dd>
            <kbd>{prefs.enterSends ? 'Enter' : 'Ctrl+Enter'}</kbd>
          </dd>
        </div>
        <div>
          <dt>关闭当前浮层</dt>
          <dd>
            <kbd>Esc</kbd>
          </dd>
        </div>
      </dl>
      <Link to="/settings/shortcuts">修改快捷键</Link>
      <h2>版本与服务状态</h2>
      <p role="status">
        {environment
          ? 'TapKit ' +
            environment.version +
            ' · Electron ' +
            environment.electron +
            ' · ' +
            (environment.packaged ? '打包版本' : '开发构建')
          : metadataFailed
            ? '无法读取构建信息。'
            : '正在读取构建信息…'}
      </p>
      <p>
        本地核心 {ready ? '可用' : '待连接'} · 模型账户 {accounts}
      </p>
      <div className="action-group">
        {prefs.showReleaseLink && (
          <button onClick={() => open(repo + '/releases')}>版本记录与新功能</button>
        )}
        <button onClick={() => open(repo + '/issues')}>查看问题进度与回复</button>
        <button onClick={() => open('https://status.openai.com/')}>查看 OpenAI 服务状态</button>
      </div>
      <h2>问题与建议</h2>
      <p>
        在这里审阅反馈附件。打开 GitHub 后，可以自行填写问题和选择上传哪些内容。GitHub Issue
        对外公开。
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={includeDiagnostic}
          disabled={!environment}
          onChange={(e) => setIncludeDiagnostic(e.target.checked)}
        />
        附带本机诊断摘要
      </label>
      {includeDiagnostic && <pre aria-label="诊断预览">{diagnostic}</pre>}
      <label className="check-label">
        <input
          type="checkbox"
          checked={includeSnippet}
          onChange={(e) => setIncludeSnippet(e.target.checked)}
        />
        附带我选定的会话片段
      </label>
      {includeSnippet && (
        <label>
          粘贴要分享的内容
          <textarea
            maxLength={8000}
            rows={4}
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
          />
        </label>
      )}
      <label>
        选择本机截图（PNG / JPEG，最多 5 MB）
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            const request = ++imageRequest.current;
            e.currentTarget.value = '';
            setScreenshot('');
            if (selected)
              void prepareScreenshot(selected)
                .then((value) => {
                  if (request === imageRequest.current) setScreenshot(value);
                })
                .catch(() => {
                  if (request === imageRequest.current)
                    setNotice('无法读取该截图，请选择较小的 PNG 或 JPEG 文件。');
                });
          }}
        />
      </label>
      {screenshot && (
        <div>
          <img className="support-screenshot" src={screenshot} alt="将随诊断附件保存的截图" />
          <button onClick={() => setScreenshot('')}>移除截图</button>
        </div>
      )}
      <div className="action-group">
        <button
          disabled={
            busy || !(includeDiagnostic || (includeSnippet && snippet.trim()) || screenshot)
          }
          onClick={() => void save()}
        >
          {busy ? '正在保存…' : '保存反馈附件'}
        </button>
        <button onClick={() => open(repo + '/issues/new')}>在 GitHub 提交问题</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

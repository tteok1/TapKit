import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  SiteBriefSchema,
  type CodeView,
  type SiteCommand,
  type SiteRegion,
  type SiteView,
  type WorkView,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { workCommand } from './work-ui';
import { nativeViewOccluded } from './native-view-layout';
import './site.css';

async function siteCommand(command: SiteCommand, payload: unknown) {
  const reply = await window.tapkit.siteCommand(requestOptions(), command, payload);
  if (!reply.ok) throw Error(reply.error.code);
  return reply.data;
}

const canRevise = ['completed', 'partial', 'failed', 'paused', 'waiting_user', 'budget_stopped'];
const widths = [
  { name: '桌面', width: 900 },
  { name: '平板', width: 768 },
  { name: '手机', width: 390 },
] as const;
type Viewport = (typeof widths)[number]['width'];
function recovery(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'CONFLICT':
      return '工作版本已变化，或存在未构建的修改。刷新状态后重试，也可复制已保存的版本。';
    case 'PERMISSION_DENIED':
      return '当前操作超出工作授权，或源码含凭据。请核对工作和源码。';
    case 'FEATURE_NOT_AVAILABLE':
    case 'SANDBOX_UNAVAILABLE':
      return '构建环境尚未就绪。请在运行与终端中检查隔离能力及依赖。';
    case 'OUTPUT_LIMIT_REACHED':
      return '已达到此工作的网站版本上限。可复制所选版本到新工作。';
    case 'NOT_FOUND':
      return '预览已结束或产物缺失。请刷新状态或重新构建。';
    case 'VALIDATION_ERROR':
      return '请检查网站目标与页面名称，页面名称应为 1 到 8 行。';
    default:
      return '操作未完成。请检查运行与终端中的构建结果，然后重试。';
  }
}

export function SitePanel({
  work,
  code,
  onCodeChanged,
  onNavigate,
}: {
  work: WorkView;
  code: CodeView | undefined;
  onCodeChanged: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const { runId } = work;
  const [site, setSite] = useState<SiteView>();
  const [expanded, setExpanded] = useState(false);
  const [prepareDependencies, setPrepareDependencies] = useState(false);
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState<{ previewId: string; versionId: string }>();
  const [viewport, setViewport] = useState<Viewport>(900);
  const [region, setRegion] = useState<SiteRegion>();
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const pane = useRef<HTMLDivElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  const feedbackInput = useRef<HTMLTextAreaElement>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void siteCommand('site.status', { runId })
      .then((data) => {
        if (cancelled || !('site' in data)) return;
        setSite(data.site);
        setSelected((id) =>
          data.site.versions.some((version) => version.id === id)
            ? id
            : (data.site.versions[0]?.id ?? ''),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, code?.revision, work.status]);
  useEffect(() => {
    if (!open) return;
    return () => {
      void siteCommand('previews.stop', { previewId: open.previewId }).catch(() => {});
    };
  }, [open]);
  useEffect(() => {
    setOpen(undefined);
    setRegion(undefined);
  }, [work.status, code?.revoked]);
  useEffect(() => {
    if (region) feedbackInput.current?.focus();
  }, [region]);
  useEffect(() => {
    if (!open || !pane.current) return;
    let frame = 0,
      last = '';
    const box = pane.current;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = box.getBoundingClientRect();
        let top = Math.max(0, rect.top),
          bottom = Math.min(window.innerHeight, rect.bottom);
        for (let parent = box.parentElement; parent; parent = parent.parentElement) {
          if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowY)) {
            const bounds = parent.getBoundingClientRect();
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        const bounds = {
          x: Math.round(rect.left),
          y: Math.round(top),
          width: Math.round(rect.width),
          height:
            document.visibilityState === 'visible' && !nativeViewOccluded(rect)
              ? Math.max(0, Math.round(bottom - top))
              : 0,
        };
        const key = JSON.stringify(bounds);
        if (key === last) return;
        last = key;
        void siteCommand('previews.resize', { previewId: open.previewId, viewport, bounds }).catch(
          () => {
            if (active.current)
              setOpen((preview) => (preview?.previewId === open.previewId ? undefined : preview));
          },
        );
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(box);
    const overlays = new MutationObserver(sync);
    overlays.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'aria-hidden', 'aria-modal', 'style', 'class'],
    });
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer.disconnect();
      overlays.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [open, viewport]);

  async function perform(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      if (active.current) setError(recovery(failure));
    } finally {
      if (active.current) setBusy('');
    }
  }
  async function show(versionId: string) {
    const data = await siteCommand('previews.start', { runId, versionId });
    if (!('sitePreview' in data)) throw Error('INTERNAL_ERROR');
    const { previewId } = data.sitePreview;
    if (!active.current) {
      await siteCommand('previews.stop', { previewId });
      return;
    }
    setOpen({ previewId, versionId });
    setRegion(undefined);
    requestAnimationFrame(() => pane.current?.scrollIntoView({ block: 'nearest' }));
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void perform('正在创建网站源码', async () => {
      const brief = SiteBriefSchema.safeParse({
        goal: fields.get('goal'),
        audience: fields.get('audience'),
        pages: String(fields.get('pages'))
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        template: fields.get('template'),
        style: fields.get('style'),
      });
      if (!brief.success) throw Error('VALIDATION_ERROR');
      const data = await siteCommand('site.create', { runId, brief: brief.data });
      if (!('site' in data)) throw Error('INTERNAL_ERROR');
      setSite(data.site);
      await onCodeChanged();
    });
  }
  if (code?.revoked || (!site && code)) return null;
  const version = site?.versions.find((entry) => entry.id === selected);
  const current = site?.versions.find((entry) => entry.sourceHash === site.sourceHash);
  const pinned = site?.versions.find((entry) => entry.id === open?.versionId);
  const enabled =
    !busy &&
    !['running', 'waiting_tool', 'pausing', 'cancelled', 'recovering'].includes(work.status);

  return (
    <section className="site-panel" aria-label="网站">
      <div className="code-toolbar">
        <h4>网站</h4>
        {!site && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            从文字创建
          </button>
        )}
        {site && (
          <button
            type="button"
            disabled={!enabled}
            onClick={() =>
              void perform('正在沙箱构建', async () => {
                const result = await siteCommand('site.build', {
                  runId,
                  prepareDependencies,
                });
                if (!('site' in result)) throw Error('INTERNAL_ERROR');
                setSite(result.site);
                if (result.site.build?.state !== 'succeeded') {
                  setError(
                    '构建失败（退出码 ' +
                      (result.site.build?.exitCode ?? '未知') +
                      '）。请查看运行与终端。',
                  );
                  return;
                }
                const latest = result.site.versions[0];
                if (!latest) throw Error('INTERNAL_ERROR');
                setSelected(latest.id);
                await onCodeChanged();
                setNotice('构建完成');
                if (open) await show(latest.id);
              })
            }
          >
            构建网站
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {(busy || notice) && <p role="status">{busy || notice}</p>}
      {site?.brief.template === 'react' && (
        <label>
          <input
            type="checkbox"
            checked={prepareDependencies}
            disabled={!!busy}
            onChange={(event) => setPrepareDependencies(event.target.checked)}
          />
          允许从 npm 准备锁定依赖
        </label>
      )}
      {!site && expanded && (
        <form aria-label="创建网站源码" onSubmit={create}>
          <label>
            网站目标
            <input
              name="goal"
              required
              maxLength={160}
              defaultValue={work.definition.goal.slice(0, 160)}
            />
          </label>
          <label>
            面向受众
            <input
              name="audience"
              maxLength={240}
              defaultValue={work.definition.audience.slice(0, 240)}
            />
          </label>
          <label>
            页面名称（每行一个）
            <textarea
              name="pages"
              aria-label="页面名称（每行一个）"
              required
              maxLength={480}
              rows={3}
              defaultValue={'首页\n关于'}
            />
          </label>
          <div className="site-actions">
            <label>
              模板
              <select name="template">
                <option value="html">纯 HTML</option>
                <option value="react">React / Vite</option>
              </select>
            </label>
            <label>
              样式
              <select name="style">
                <option value="paper">暖白</option>
                <option value="studio">浅绿</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={!enabled}>
            生成网站源码
          </button>
        </form>
      )}
      {site && !site.versions.length && <p>构建后可在这里打开预览、查看版本及下载源码。</p>}
      {site?.versions.length ? (
        <>
          {!current && <p role="status">工作区源码已修改，构建后可预览新版本。</p>}
          <div className="site-actions">
            <label>
              构建版本
              <select
                aria-label="构建版本"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                {site.versions.map((entry, index) => (
                  <option key={entry.id} value={entry.id}>
                    版本 {site.versions.length - index} ·{' '}
                    {new Date(entry.createdAt).toLocaleString('zh-CN')}{' '}
                    {current?.id === entry.id ? '· 当前源码' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!version || !!busy}
              onClick={() => void perform('正在打开预览', () => show(selected))}
            >
              打开预览
            </button>
            <button
              type="button"
              disabled={!version || !!busy}
              onClick={() =>
                void perform('正在准备源码 ZIP', async () => {
                  const result = await siteCommand('site.download', { runId, versionId: selected });
                  if ('siteSaved' in result && result.siteSaved) setNotice('已保存源码 ZIP');
                })
              }
            >
              下载源码
            </button>
            <button
              type="button"
              disabled={!version || !current || version.sourceHash === site.sourceHash || !enabled}
              onClick={() =>
                void perform('正在恢复版本', async () => {
                  const result = await siteCommand('site.restore', {
                    runId,
                    versionId: selected,
                    expectedSourceHash: site.sourceHash,
                  });
                  if (!('site' in result)) throw Error('INTERNAL_ERROR');
                  setSite(result.site);
                  await onCodeChanged();
                  if (open) await show(selected);
                  setNotice('已恢复所选版本的源码');
                })
              }
            >
              恢复源码
            </button>
            <button
              type="button"
              disabled={!version || !enabled}
              onClick={() =>
                void perform('正在复制网站', async () => {
                  const result = await workCommand('runs.create', {
                    sessionId: work.sessionId,
                    goal: site.brief.goal + '（副本）',
                    audience: site.brief.audience,
                    planFirst: true,
                  });
                  if (!('work' in result)) throw Error('CONFLICT');
                  await siteCommand('site.copy', {
                    runId,
                    versionId: selected,
                    targetRunId: result.work.runId,
                  });
                  onNavigate('/work/' + result.work.runId);
                })
              }
            >
              复制到新工作
            </button>
          </div>
          {open && (
            <>
              <div className="site-actions" aria-label="预览操作">
                <span>
                  预览版本{' '}
                  {site.versions.findIndex((entry) => entry.id === open.versionId) < 0
                    ? '—'
                    : site.versions.length -
                      site.versions.findIndex((entry) => entry.id === open.versionId)}
                </span>
                <div className="site-actions" role="group" aria-label="视口">
                  {widths.map(({ name, width }) => (
                    <button
                      key={width}
                      type="button"
                      aria-pressed={viewport === width}
                      onClick={() => setViewport(width)}
                    >
                      {name} {width}px
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    void siteCommand('previews.focus', { previewId: open.previewId }).catch(
                      (failure) => setError(recovery(failure)),
                    );
                  }}
                >
                  进入预览（Esc 返回）
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    void perform('正在刷新预览', async () => {
                      await siteCommand('previews.refresh', { previewId: open.previewId });
                      setRegion(undefined);
                    })
                  }
                >
                  刷新预览
                </button>
                <button
                  ref={pickButton}
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    void perform('点击页面区域，或聚焦后按 Enter', async () => {
                      const data = await siteCommand('previews.select', {
                        previewId: open.previewId,
                      });
                      if ('sitePreview' in data && data.sitePreview.region)
                        setRegion(data.sitePreview.region);
                      else {
                        setNotice('未选择区域');
                        requestAnimationFrame(() => pickButton.current?.focus());
                      }
                    })
                  }
                >
                  选取页面区域
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(undefined);
                    setRegion(undefined);
                  }}
                >
                  关闭预览
                </button>
              </div>
              <div
                ref={pane}
                className="site-viewport"
                style={{ width: viewport }}
                aria-label="本地网站预览"
              />
              {region && pinned && (
                <form
                  aria-label="修改选中区域"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform('正在创建修订工作', async () => {
                      const fresh = await siteCommand('site.status', { runId });
                      if (!('site' in fresh) || fresh.site.sourceHash !== pinned.sourceHash)
                        throw Error('CONFLICT');
                      const result = await workCommand(
                        'runs.steer',
                        {
                          runId,
                          clientRequestId: requestOptions().requestId,
                          text: `${work.definition.goal.slice(0, 12000)}\n网站区域修改：${feedback.trim()}`,
                        },
                        work.revision,
                      );
                      if (!('work' in result)) throw Error('CONFLICT');
                      const inherited = await window.tapkit.codeCommand(
                        requestOptions(),
                        'code.inherit',
                        {
                          runId: result.work.runId,
                          sourceRunId: runId,
                          siteRevision: {
                            versionId: pinned.id,
                            sourceHash: pinned.sourceHash,
                            region,
                          },
                        },
                      );
                      if (!inherited.ok) throw Error(inherited.error.code);
                      onNavigate('/work/' + result.work.runId);
                    });
                  }}
                >
                  <p>
                    <code>{region.selector}</code> · {region.width} × {region.height}
                  </p>
                  {region.text && <blockquote>{region.text}</blockquote>}
                  <label>
                    修改要求
                    <textarea
                      ref={feedbackInput}
                      required
                      maxLength={2000}
                      rows={3}
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      !enabled ||
                      !canRevise.includes(work.status) ||
                      pinned.sourceHash !== site.sourceHash ||
                      !feedback.trim()
                    }
                  >
                    创建区域修订工作
                  </button>
                </form>
              )}
            </>
          )}
          <p className="code-scope">公网发布待支持</p>
        </>
      ) : null}
    </section>
  );
}

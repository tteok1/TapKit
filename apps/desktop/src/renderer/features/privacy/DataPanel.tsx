import { useEffect, useState } from 'react';
import {
  DataImpactSchema,
  DataStatusSchema,
  PortableCountsSchema,
  z,
  type DataCategory,
  type Reply,
} from '@tapkit/contracts';
import { requestOptions } from '../../src/desktop-state';

const names = { sessions: '会话', projects: '项目', files: '文件', memories: '记忆' };
const categories = Object.keys(names) as DataCategory[];
const states = {
  queued: '等待处理',
  running: '处理中',
  completed: '完成',
  failed: '失败',
  cancelled: '已取消',
  unknown: '状态待确认',
};
const stages = { queued: '', backups: ' · 清理备份', garbage: ' · 回收文件数据', completed: '' };
const errors: Record<string, string> = {
  CONFLICT: '数据已变更或另一个操作正在执行，请重新预览或稍后再试。',
  VALIDATION_ERROR: '数据包格式、版本或校验值不正确。',
  QUOTA_EXHAUSTED: '空间不足，或数据超过单次操作上限。',
  DATABASE_RECOVERY_REQUIRED: '找不到可以读取的本机数据库或备份。',
  CANCELLED: '操作已取消。',
};
function unwrap(reply: Reply) {
  if (!reply.ok) throw Error(reply.error.code);
  return reply.data;
}
export function DataPanel({ recovery = false }: { recovery?: boolean }) {
  const [status, setStatus] = useState<z.infer<typeof DataStatusSchema>>();
  const [impact, setImpact] = useState<z.infer<typeof DataImpactSchema>>();
  const [selected, setSelected] = useState<DataCategory[]>(categories);
  const [includeBackups, setIncludeBackups] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupId, setBackupId] = useState('');
  const command = (name: Parameters<typeof window.tapkit.dataCommand>[1], payload: unknown) =>
    window.tapkit.dataCommand(requestOptions(), name, payload).then(unwrap);
  async function refresh() {
    const reply = z
      .object({ dataStatus: DataStatusSchema })
      .parse(await command('data.status', {}));
    setStatus(reply.dataStatus);
  }
  useEffect(() => {
    if (recovery) return;
    let mounted = true;
    const update = async () => {
      try {
        const reply = z
          .object({ dataStatus: DataStatusSchema })
          .parse(await command('data.status', {}));
        if (mounted) setStatus(reply.dataStatus);
      } catch {
        if (mounted) setStatus(undefined);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 1800);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [recovery]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (error) {
      setNotice(
        errors[error instanceof Error ? error.message : ''] ??
          '操作失败，请检查文件或目录访问权限后重试。',
      );
    } finally {
      setBusy(false);
    }
  }
  const selection = { categories: selected, includeBackups };
  const transfer = (action: 'export' | 'import') =>
    run(async () => {
      const reply = await window.tapkit.transferData(
        action,
        action === 'export' ? selected : undefined,
      );
      if (!reply) return;
      const { dataTransfer } = z
        .object({ dataTransfer: PortableCountsSchema })
        .parse(unwrap(reply));
      setNotice(
        (action === 'export' ? '已导出 ' : '已导入 ') +
          categories.map((key) => names[key] + ' ' + dataTransfer[key]).join('、'),
      );
    });
  return (
    <article aria-label="本机数据管理">
      <h2>本机数据</h2>
      {recovery ? (
        <p>可从最近一份通过校验的本机备份导出资料。</p>
      ) : (
        <p>
          回收站保留 30 天，脱敏诊断日志保留 14 天。TapKit
          无需注册账户，连接授权可在「连接」中断开。
        </p>
      )}
      <fieldset disabled={busy} aria-label="数据类别">
        <legend>选择导出或清理的类别</legend>
        {categories.map((key) => (
          <label className="check-label" key={key}>
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={(event) => {
                setImpact(undefined);
                setSelected((current) =>
                  event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                );
              }}
            />
            {names[key]}
          </label>
        ))}
      </fieldset>
      <p>
        ZIP
        包可导入另一台设备。包内包含所选资料的内容，请按个人文件保管。账户授权和应用设置留在本机。
      </p>
      <div className="action-group">
        <button disabled={busy || !selected.length} onClick={() => void transfer('export')}>
          导出数据包
        </button>
        {!recovery && (
          <button disabled={busy || !status} onClick={() => void transfer('import')}>
            导入数据包
          </button>
        )}
      </div>
      {!recovery && (
        <>
          <h3>永久清理</h3>
          <label className="check-label">
            <input
              type="checkbox"
              checked={includeBackups}
              disabled={busy}
              onChange={(event) => {
                setImpact(undefined);
                setIncludeBackups(event.target.checked);
              }}
            />
            同时清理含这些资料的本机备份
          </label>
          <button
            disabled={busy || !status || !selected.length}
            onClick={() =>
              void run(async () => {
                const reply = z
                  .object({ dataImpact: DataImpactSchema })
                  .parse(await command('data.clearPreview', selection));
                setImpact(reply.dataImpact);
              })
            }
          >
            预览清理影响
          </button>
          {impact && (
            <div role="region" aria-label="清理影响">
              <p>{categories.map((key) => names[key] + ' ' + impact[key]).join('、')}</p>
              <p>
                消息 {impact.messages}、引用 {impact.links}、索引 {impact.indexes}、缓存{' '}
                {impact.caches}、预览 {impact.previews}、运行 {impact.runs}、关联记忆{' '}
                {impact.relatedMemories}、待检查备份 {impact.backups}。
              </p>
              <p>永久清理无法撤销。清理项目会一并移除关联会话和项目记忆。</p>
              <div className="action-group">
                <button
                  disabled={busy || categories.every((key) => !impact[key])}
                  onClick={() =>
                    void run(async () => {
                      const impactHash = impact.impactHash;
                      setImpact(undefined);
                      await command('data.clear', { ...selection, impactHash });
                      setNotice('已开始清理，可在下方查看进度。');
                      await refresh();
                    })
                  }
                >
                  确认永久清理
                </button>
                <button disabled={busy} onClick={() => setImpact(undefined)}>
                  取消
                </button>
              </div>
            </div>
          )}
          <h3>备份与恢复</h3>
          <p>应用启动时每天创建一次快照，保留最近 7 天的自动快照。恢复会重新启动应用。</p>
          <div className="action-group">
            <button
              disabled={busy || !status}
              onClick={() =>
                void run(async () => {
                  unwrap(await window.tapkit.backup(requestOptions()));
                  setNotice('已安排创建本机备份。');
                  await refresh();
                })
              }
            >
              立即备份
            </button>
            <label>
              选择备份
              <select value={backupId} onChange={(event) => setBackupId(event.target.value)}>
                <option value="">选择日期</option>
                {status?.backups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleString()} ·{' '}
                    {item.verified ? '有校验值' : '旧版快照'}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !status?.backups.some((item) => item.id === backupId)}
              onClick={() =>
                void run(async () => {
                  if (await window.tapkit.restoreData(backupId)) setNotice('应用正在重新启动。');
                })
              }
            >
              恢复所选备份
            </button>
          </div>
          {status?.lastRestore && (
            <p>最近一次恢复{status.lastRestore === 'restored' ? '成功' : '失败'}。</p>
          )}
          <h3>数据位置</h3>
          <p>{status?.dataRoot ?? '正在读取本机数据位置…'}</p>
          <button
            disabled={busy || !status}
            onClick={() =>
              void run(async () => {
                if (await window.tapkit.moveDataRoot())
                  setNotice('数据位置已更新，应用正在重新启动。');
              })
            }
          >
            迁移数据目录
          </button>
          <p>迁移前请结束正在使用的工作，并处理已连接的 Git 工作树。</p>
          {!!status?.jobs.length && (
            <section aria-label="数据操作进度">
              <h3>操作进度</h3>
              <ul>
                {status.jobs.map((job) => (
                  <li key={job.id}>
                    {job.kind === 'data.backup' ? '备份' : '清理'} · {states[job.status]}
                    {stages[job.stage]}
                    {job.kind === 'data.clear' && job.status === 'failed' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await command('data.retryClear', { jobId: job.id });
                            await refresh();
                          })
                        }
                      >
                        重试清理
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p role="status" aria-label="本机数据操作状态">
        {busy ? '处理中…' : notice}
      </p>
    </article>
  );
}

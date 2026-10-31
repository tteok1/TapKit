import { newId } from '../../packages/storage/src';
import { canonicalHash } from '../../packages/tools/src/registry';
import {
  BrowserActionSchema,
  type BrowserHostRequest,
  type BrowserSnapshot,
} from '../../packages/contracts/src';
export function browserHostFixture() {
  const tabs = new Map<string, BrowserSnapshot>();
  const state = { writes: 0, opens: 0, unknown: false, disposed: 0, field: '合成内容' };
  function change(snapshot: BrowserSnapshot) {
    return {
      ...snapshot,
      id: newId(),
      revision: canonicalHash({ previous: snapshot.revision, field: state.field, seq: newId() }),
    };
  }
  const host = async (p: BrowserHostRequest): Promise<unknown> => {
    if (p.op === 'dispose') {
      state.disposed++;
      tabs.clear();
      return true;
    }
    if (p.op === 'open') {
      state.opens++;
      const snapshot: BrowserSnapshot = {
        id: newId(),
        tabId: newId(),
        url: p.url!,
        title: '合成网页',
        navigationEpoch: 1,
        revision: canonicalHash(state.field),
        text: '合成网页内容',
        selection: '',
        nodes: [],
        downloads: [],
        mode: 'agent',
        blocked: null,
        truncated: false,
      };
      tabs.set(snapshot.tabId, snapshot);
      return snapshot;
    }
    const snapshot = tabs.get(p.tabId!);
    if (!snapshot) throw Error('NOT_FOUND');
    if (p.op === 'observe') return snapshot;
    if (p.op === 'control') {
      const next = change({ ...snapshot, mode: p.mode! });
      tabs.set(p.tabId!, next);
      return next;
    }
    if (p.op === 'prepare') {
      const action = BrowserActionSchema.parse(p.action);
      if (snapshot.mode !== 'agent') throw Error('PERMISSION_DENIED');
      if (snapshot.id !== action.snapshotId) throw Error('APPROVAL_STALE');
      return {
        snapshot,
        classification: action.nodeId === 'manual' ? 'takeover' : 'submit',
        target: snapshot.url + '/submit',
        preview: JSON.stringify({ message: state.field }),
        binding: canonicalHash({ snapshot: snapshot.revision, field: state.field, action }),
      };
    }
    if (p.op === 'act') {
      if (p.action?.nodeId === 'manual') {
        const next = change({ ...snapshot, mode: 'user' });
        tabs.set(p.tabId!, next);
        return { state: 'takeover', snapshot: next };
      }
      if (!p.approved) throw Error('PERMISSION_DENIED');
      state.writes++;
      const next = change({ ...snapshot, text: '提交回执' });
      tabs.set(p.tabId!, next);
      return { state: state.unknown ? 'unknown' : 'submitted', snapshot: next };
    }
    if (p.op === 'close') tabs.delete(p.tabId!);
    return true;
  };
  return { host, tabs, state };
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from '@tapkit/ui';
import {
  ArtifactReplySchema,
  ResourceRefSchema,
  type ArtifactView,
  type FileOwner,
  type Locator,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from '../../src/desktop-state';

export type ViewerAccess = {
  fileId: string;
  versionId?: string | undefined;
  owner?: FileOwner | undefined;
  locator?: Locator | undefined;
};
export type ViewerTab = {
  key: string;
  access: ViewerAccess;
  view?: ArtifactView;
  error?: string;
  loading: boolean;
  generation?: number;
};
export type Selection = {
  ref: z.infer<typeof ResourceRefSchema>;
  selectedText: string;
  selectedTextHash: string;
  note?: string;
};
type ViewerState = {
  tabs: ViewerTab[];
  active: string;
  open: (access: ViewerAccess) => Promise<void>;
  close: (key: string) => void;
  activate: (key: string) => void;
  reload: (key: string, retry?: boolean) => Promise<void>;
  remember: (key: string, position: ArtifactView['position']) => void;
  quote: (selection: Selection) => void;
  pendingSelection?: Selection | undefined;
  consumeSelection: () => void;
};
const Context = createContext<ViewerState | null>(null);
export async function artifactCommand(
  command: Parameters<typeof window.tapkit.artifactCommand>[1],
  payload: unknown,
) {
  const reply = await window.tapkit.artifactCommand(requestOptions(), command, payload);
  if (!reply.ok) throw new Error(reply.error.code);
  return ArtifactReplySchema.parse(reply.data);
}
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ViewerTab[]>([]),
    [active, setActive] = useState(''),
    [pendingSelection, setSelection] = useState<Selection>();
  const current = useRef(tabs);
  current.current = tabs;
  const sequence = useRef(new Map<string, number>());
  const navigate = useNavigate(),
    location = useLocation();
  const lastChatRoute = useRef('/');
  useEffect(() => {
    if (/^\/(?:sessions\/[^/]+)?$/.test(location.pathname))
      lastChatRoute.current = location.pathname;
  }, [location.pathname]);
  const load = useCallback(async (key: string, access: ViewerAccess, retry = false) => {
    const ticket = (sequence.current.get(key) ?? 0) + 1;
    sequence.current.set(key, ticket);
    setTabs((old) => old.map((tab) => (tab.key === key ? { ...tab, access, loading: true } : tab)));
    try {
      const reply = await artifactCommand('artifacts.open', { ...access, retry });
      if (!('artifact' in reply)) throw new Error('INTERNAL_ERROR');
      if (sequence.current.get(key) !== ticket) return;
      const view = reply.artifact,
        pinned = { ...access, versionId: view.file.version.id };
      setTabs((old) =>
        old.map((tab) =>
          tab.key === key
            ? {
                key,
                access: pinned,
                view,
                loading: false,
                generation: (tab.generation ?? 0) + (retry ? 1 : 0),
              }
            : tab,
        ),
      );
    } catch (error) {
      if (sequence.current.get(key) !== ticket) return;
      setTabs((old) =>
        old.map((tab) =>
          tab.key === key
            ? {
                ...tab,
                access,
                loading: false,
                error: error instanceof Error ? error.message : 'INTERNAL_ERROR',
              }
            : tab,
        ),
      );
    }
  }, []);
  const open = useCallback(
    async (access: ViewerAccess) => {
      // Resolve the current ID before constructing a tab key; a tab never drifts to a new version.
      const file = await window.tapkit.fileCommand(requestOptions(), 'files.get', {
        fileId: access.fileId,
        ...(access.versionId ? { versionId: access.versionId } : {}),
        ...(access.owner ? { owner: access.owner } : {}),
      });
      if (!file.ok || !('file' in file.data))
        throw new Error(file.ok ? 'INTERNAL_ERROR' : file.error.code);
      const pinned = { ...access, versionId: file.data.file.version.id };
      const key = JSON.stringify([
        pinned.fileId,
        pinned.versionId,
        pinned.owner ?? { type: 'library' },
      ]);
      if (!current.current.some((t) => t.key === key)) {
        if (current.current.length >= 20) throw new Error('OUTPUT_LIMIT_REACHED');
        const tab = { key, access: pinned, loading: true };
        current.current = [...current.current, tab];
        setTabs((old) => (old.some((t) => t.key === key) ? old : [...old, tab]));
      }
      setActive(key);
      await load(key, pinned);
    },
    [load],
  );
  const reload = useCallback(
    async (key: string, retry = false) => {
      const tab = current.current.find((t) => t.key === key);
      if (tab) await load(key, tab.access, retry);
    },
    [load],
  );
  const close = useCallback((key: string) => {
    sequence.current.set(key, (sequence.current.get(key) ?? 0) + 1);
    const tab = current.current.find((t) => t.key === key);
    if (
      tab?.access.versionId &&
      !current.current.some(
        (other) => other.key !== key && other.access.versionId === tab.access.versionId,
      )
    )
      void artifactCommand('artifacts.cancel', {
        fileId: tab.access.fileId,
        versionId: tab.access.versionId,
        ...(tab.access.owner ? { owner: tab.access.owner } : {}),
      }).catch(() => {});
    const remaining = current.current.filter((t) => t.key !== key);
    current.current = remaining;
    setTabs(remaining);
    setActive((old) => (old === key ? (remaining.at(-1)?.key ?? '') : old));
  }, []);
  useEffect(() => {
    let stopped = false,
      unsubscribe: (() => void) | undefined;
    void window.tapkit
      .subscribeEvents(requestOptions(), { streamId: 'profile', afterSeq: 0 }, (event) => {
        if (!stopped && event.type === 'workspace.updated')
          for (const tab of current.current) if (!tab.loading) void load(tab.key, tab.access);
      })
      .then((stop) => {
        if (stopped) stop();
        else unsubscribe = stop;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [load]);
  const quote = (selection: Selection) => {
    setSelection(selection);
    if (!/^\/(?:sessions\/[^/]+)?$/.test(location.pathname)) navigate(lastChatRoute.current);
  };
  const remember = (key: string, position: ArtifactView['position']) =>
    setTabs((old) =>
      old.map((tab) =>
        tab.key === key && tab.view ? { ...tab, view: { ...tab.view, position } } : tab,
      ),
    );
  return (
    <Context.Provider
      value={{
        tabs,
        active,
        open,
        close,
        activate: setActive,
        reload,
        remember,
        quote,
        pendingSelection,
        consumeSelection: () => setSelection(undefined),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useViewer() {
  const state = useContext(Context);
  if (!state) throw new Error('ViewerProvider missing');
  return state;
}

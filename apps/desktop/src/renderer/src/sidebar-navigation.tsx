import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Link, useLocation } from '@tapkit/ui';
import { navigationOrder, type NavigationKey, type WindowLayout } from './desktop-state';
import { UiIcon, type IconName } from './ui-icon';
import t from '../locales/desktop.zh-CN.json';

const icons: Record<NavigationKey, IconName> = {
  chats: 'chat',
  work: 'work',
  projects: 'folder',
  files: 'file',
};
type Gesture = {
  key: NavigationKey;
  pointerId: number;
  x: number;
  y: number;
  anchor: HTMLAnchorElement;
  active: boolean;
  order: NavigationKey[];
};

export function SidebarNavigation({
  order,
  onReorder,
}: {
  order: WindowLayout['navigation'];
  onReorder: (order: NavigationKey[]) => void;
}) {
  const location = useLocation();
  const helpId = useId();
  const nav = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<NavigationKey[]>();
  const [dragging, setDragging] = useState<NavigationKey>();
  const [announcement, setAnnouncement] = useState('');
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    const previous = gesture.current;
    gesture.current = undefined;
    if (previous?.anchor.hasPointerCapture(previous.pointerId))
      previous.anchor.releasePointerCapture(previous.pointerId);
    setPreview(undefined);
    setDragging(undefined);
  }, []);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (gesture.current) suppressClick.current = true;
        cancel();
      }
    }
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('keydown', escape);
      clearTimeout(timer.current);
      const previous = gesture.current;
      gesture.current = undefined;
      if (previous?.anchor.hasPointerCapture(previous.pointerId))
        previous.anchor.releasePointerCapture(previous.pointerId);
    };
  }, [cancel]);
  function move(event: PointerEvent<HTMLAnchorElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) {
        suppressClick.current = true;
        cancel();
      }
      return;
    }
    event.preventDefault();
    const peers = [
      ...nav.current!.querySelectorAll<HTMLAnchorElement>('[data-navigation-key]'),
    ].filter((el) => el.dataset.navigationKey !== current.key);
    const index = peers.filter((el) => {
      const r = el.getBoundingClientRect();
      return event.clientY > r.top + r.height / 2;
    }).length;
    const next = current.order.filter((key) => key !== current.key);
    next.splice(index, 0, current.key);
    if (next.join() !== current.order.join()) {
      current.order = next;
      setPreview(next);
    }
    // Keep a short/dense sidebar scrollable during an intentional drag.
    const scroll = nav.current!.closest('.sidebar-scroll');
    if (scroll) {
      const box = scroll.getBoundingClientRect();
      if (event.clientY < box.top + 24) scroll.scrollTop -= 12;
      if (event.clientY > box.bottom - 24) scroll.scrollTop += 12;
    }
  }
  return (
    <nav
      ref={nav}
      className={'sidebar-navigation' + (dragging ? ' is-reordering' : '')}
      aria-label="主导航"
    >
      <span id={helpId} className="sr-only">
        长按并上下拖动调整顺序，也可按 Alt 加上下方向键。
      </span>
      {navigationOrder(order).map((key) => (
        <Link
          key={key}
          to={'/' + key}
          aria-label={t[key]}
          aria-current={
            location.pathname === '/' + key ||
            (key === 'chats' && location.pathname === '/bookmarks')
              ? 'page'
              : undefined
          }
          aria-describedby={helpId}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          data-tooltip={dragging ? undefined : t[key] + '（长按拖动调整顺序）'}
          data-navigation-key={key}
          style={{ order: (preview ?? navigationOrder(order)).indexOf(key) }}
          className={dragging === key ? 'navigation-dragging' : undefined}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            if (gesture.current?.active) e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
              return;
            cancel();
            suppressClick.current = false;
            gesture.current = {
              key,
              pointerId: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              anchor: e.currentTarget,
              active: false,
              order: navigationOrder(order),
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            timer.current = setTimeout(() => {
              const current = gesture.current;
              if (!current) return;
              current.active = true;
              suppressClick.current = true;
              setDragging(key);
              setPreview(current.order);
              setAnnouncement('正在调整' + t[key] + '的位置，按 Escape 取消。');
            }, 450);
          }}
          onPointerMove={move}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onPointerUp={(e) => {
            const current = gesture.current;
            if (!current || current.pointerId !== e.pointerId) return;
            if (current.active) {
              onReorder(current.order);
              setAnnouncement(t[key] + '已移至第' + (current.order.indexOf(key) + 1) + '位。');
              requestAnimationFrame(() => current.anchor.isConnected && current.anchor.focus());
            }
            cancel();
          }}
          onClick={(e) => {
            if (suppressClick.current && e.detail !== 0) {
              e.preventDefault();
              e.stopPropagation();
            }
            suppressClick.current = false;
          }}
          onKeyDown={(e) => {
            if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            cancel();
            const next = navigationOrder(order),
              index = next.indexOf(key);
            const target = index + (e.key === 'ArrowUp' ? -1 : 1);
            if (!next[target]) return;
            [next[index], next[target]] = [next[target]!, next[index]!];
            onReorder(next);
            setAnnouncement(t[key] + '已移至第' + (target + 1) + '位。');
            const anchor = e.currentTarget;
            requestAnimationFrame(() => anchor.isConnected && anchor.focus());
          }}
        >
          <UiIcon name={icons[key]} />
          {t[key]}
        </Link>
      ))}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </nav>
  );
}

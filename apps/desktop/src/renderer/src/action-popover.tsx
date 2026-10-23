import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { UiIcon, type IconName } from './ui-icon';
import { Tooltip } from './tooltip';

export function IconButton({
  icon,
  label,
  tooltip,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tooltip?: string }) {
  return (
    <Tooltip label={tooltip ?? label}>
      <button type="button" className={'icon-button ' + className} aria-label={label} {...props}>
        <UiIcon name={icon} />
      </button>
    </Tooltip>
  );
}

// Native popovers escape scrolling containers and supply outside-click/Escape dismissal.
export function ActionPopover({
  label,
  icon,
  trigger,
  className = '',
  disabled = false,
  onOpen,
  children,
}: {
  label: string;
  icon?: IconName;
  trigger?: ReactNode;
  className?: string;
  disabled?: boolean;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  function position() {
    const popup = panel.current!,
      anchor = button.current!.getBoundingClientRect();
    const scale = popup.getBoundingClientRect().width / popup.offsetWidth || 1;
    const width = popup.getBoundingClientRect().width,
      height = popup.getBoundingClientRect().height;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const below = anchor.bottom + 6;
    const top =
      below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 6);
    popup.style.left = left / scale + 'px';
    popup.style.top = top / scale + 'px';
  }
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(position);
    observer.observe(panel.current!);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);
  return (
    <span className={'action-popover ' + className}>
      <Tooltip label={label}>
        <button
          ref={button}
          type="button"
          className={trigger ? 'popover-trigger' : 'icon-button'}
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          popoverTarget={id}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (!panel.current?.matches(':popover-open')) {
              panel.current?.showPopover();
              position();
              onOpen?.();
              if (e.detail === 0)
                panel.current?.querySelector<HTMLButtonElement>('button:enabled')?.focus();
            } else panel.current.hidePopover();
            e.preventDefault();
          }}
        >
          {trigger ?? <UiIcon name={icon ?? 'more'} />}
        </button>
      </Tooltip>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className="action-popover-panel"
        role="region"
        aria-label={label}
        onToggle={(e) => {
          setOpen(e.newState === 'open');
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-popover-keep-open]')) return;
          if ((e.target as HTMLElement).closest('button:enabled,a')) panel.current?.hidePopover();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') button.current?.focus();
          if (
            ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) &&
            !(
              e.target instanceof HTMLSelectElement ||
              e.target instanceof HTMLTextAreaElement ||
              e.target instanceof HTMLInputElement
            )
          ) {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled,a[href]'),
            ].filter((item) => item.getClientRects().length);
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? items.length - 1
                  : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
            e.preventDefault();
          }
        }}
      >
        {children}
      </div>
    </span>
  );
}

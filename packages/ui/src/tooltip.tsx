import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Tooltip({
  label,
  placement = 'top',
  children,
}: {
  label: string;
  placement?: 'top' | 'bottom';
  children: ReactNode;
}) {
  return (
    <span className="tooltip-anchor" data-tooltip={label} data-tooltip-placement={placement}>
      {children}
    </span>
  );
}

// One delegated layer covers table cells, disabled controls and dynamic Markdown too.
// Chromium's native `title` hints cannot share the app's theme.
export function TooltipLayer() {
  const id = useId();
  const hint = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const popup = hint.current!;
    let target: HTMLElement | undefined;
    let described: HTMLElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function hide() {
      clearTimeout(timer);
      if (popup.matches(':popover-open')) popup.hidePopover();
      if (described) {
        const ids = (described.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .filter((x) => x && x !== id);
        if (ids.length) described.setAttribute('aria-describedby', ids.join(' '));
        else described.removeAttribute('aria-describedby');
      }
      described = target = undefined;
    }
    function show(element: HTMLElement, delay: number) {
      if (target === element) return;
      hide();
      target = element;
      timer = setTimeout(() => {
        if (!element.isConnected || !element.getClientRects().length || !element.dataset.tooltip)
          return hide();
        popup.textContent = element.dataset.tooltip;
        popup.showPopover();
        const box = popup.getBoundingClientRect(),
          rect = element.getBoundingClientRect();
        const scale = box.width / popup.offsetWidth || 1;
        const below = rect.bottom + 8,
          above = rect.top - box.height - 8;
        const y =
          element.dataset.tooltipPlacement === 'bottom'
            ? below + box.height <= innerHeight - 8
              ? below
              : above
            : above >= 8
              ? above
              : below;
        popup.style.left =
          Math.max(
            8,
            Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 8),
          ) /
            scale +
          'px';
        popup.style.top = Math.max(8, Math.min(y, innerHeight - box.height - 8)) / scale + 'px';
        described = element.matches('button,a,input,select,textarea,[tabindex]')
          ? element
          : (element.querySelector<HTMLElement>('button,a,input,select,textarea,[tabindex]') ??
            element);
        described.setAttribute(
          'aria-describedby',
          [described.getAttribute('aria-describedby'), id].filter(Boolean).join(' '),
        );
      }, delay);
    }
    function enter(event: Event) {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-tooltip]')
          : null;
      if (element?.dataset.tooltip) show(element, event.type === 'focusin' ? 0 : 350);
    }
    function leave(event: MouseEvent | FocusEvent) {
      if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget)))
        hide();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    document.addEventListener('pointerover', enter, true);
    document.addEventListener('pointerout', leave, true);
    document.addEventListener('focusin', enter, true);
    document.addEventListener('focusout', leave, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('click', hide, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => {
      hide();
      document.removeEventListener('pointerover', enter, true);
      document.removeEventListener('pointerout', leave, true);
      document.removeEventListener('focusin', enter, true);
      document.removeEventListener('focusout', leave, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('click', hide, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [id]);
  return <span id={id} ref={hint} popover="manual" role="tooltip" className="rounded-tooltip" />;
}

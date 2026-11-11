export function nativeViewOccluded(rect: DOMRect) {
  return [
    ...document.querySelectorAll(
      'dialog[open], [aria-modal="true"], [role="dialog"], [role="menu"], [role="tooltip"], [popover]:popover-open',
    ),
  ].some((node) => {
    const bounds = node.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      (node.matches('dialog[open], [aria-modal="true"]') ||
        (bounds.left < rect.right &&
          bounds.right > rect.left &&
          bounds.top < rect.bottom &&
          bounds.bottom > rect.top))
    );
  });
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/** Zachytí Tab v modálnom dialógu a po zničení vráti focus na predchádzajúci element. */
export function focusTrap(node: HTMLElement, enabled = true) {
  let active = enabled;
  let previouslyFocused: HTMLElement | null = null;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const items = focusableElements(node);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (current === first || !node.contains(current)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function activate() {
    previouslyFocused = document.activeElement as HTMLElement | null;
    node.addEventListener('keydown', handleKeydown);
    queueMicrotask(() => {
      const items = focusableElements(node);
      (items[0] ?? node).focus();
    });
  }

  function deactivate() {
    node.removeEventListener('keydown', handleKeydown);
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }

  if (active) activate();

  return {
    update(next: boolean) {
      if (next === active) return;
      active = next;
      if (active) activate();
      else deactivate();
    },
    destroy() {
      if (active) deactivate();
    },
  };
}

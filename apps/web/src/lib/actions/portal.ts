/** Moves the element to a DOM target (default body) — ideal for toasts/modals. */
export function portal(node: HTMLElement, target: string | HTMLElement = 'body') {
  if (typeof document === 'undefined') {
    return { destroy() {} };
  }

  const targetEl =
    typeof target === 'string'
      ? (document.querySelector(target) as HTMLElement | null)
      : target;
  const host = targetEl ?? document.body;
  host.appendChild(node);

  return {
    destroy() {
      node.remove();
    },
  };
}

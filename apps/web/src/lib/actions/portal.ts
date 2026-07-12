/** Presunie element do document.body (mimo stacking context hlavičky). */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}

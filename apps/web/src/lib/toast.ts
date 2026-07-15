import { writable } from 'svelte/store';

export type ToastItem = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export const toasts = writable<ToastItem[]>([]);

const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function showToast(message: string, type: 'success' | 'error' = 'success', durationMs = 3400) {
  toasts.update((items) => {
    const withoutSame = items.filter((item) => !(item.message === message && item.type === type));
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const timer = setTimeout(() => dismissToast(id), durationMs);
    timers.set(id, timer);
    return [...withoutSame, { id, message, type }];
  });
}

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts.update((items) => items.filter((t) => t.id !== id));
}

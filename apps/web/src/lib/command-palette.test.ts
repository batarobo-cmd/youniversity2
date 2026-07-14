import { describe, expect, test } from 'bun:test';
import { buildCommandPaletteItems, filterCommandPaletteItems } from './command-palette';

describe('command palette', () => {
  test('student mode exposes core navigation only', () => {
    const items = buildCommandPaletteItems('sk', { platformAdmin: true, studentMode: true });
    expect(items.map((item) => item.id)).toEqual(['dashboard', 'courses', 'profile']);
  });

  test('admin mode includes administration routes', () => {
    const items = buildCommandPaletteItems('sk', { platformAdmin: false, studentMode: false });
    expect(items.some((item) => item.href.startsWith('/dashboard/admin'))).toBe(true);
  });

  test('filter matches multi-token queries', () => {
    const items = buildCommandPaletteItems('en', { platformAdmin: false, studentMode: true });
    const filtered = filterCommandPaletteItems(items, 'courses nav');
    expect(filtered.some((item) => item.id === 'courses')).toBe(true);
  });
});

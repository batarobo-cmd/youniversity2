/**
 * Local dev entry — Cursor/shell often sets NODE_ENV=production globally,
 * which would fail strict env validation against localhost defaults.
 */
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'development';
}

await import('./index.ts');

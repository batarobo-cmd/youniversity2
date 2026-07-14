/** Normalize whitespace in person names (given/family). */
export function normalizePersonName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

const PERSON_NAME_PATTERN = /^[\p{L}\p{M}\s'.-]+$/u;

/** Reject markup / control chars that should never appear in a name field. */
export function isSafePersonName(input: string): boolean {
  if (!input || input.length > 100) return false;
  if (/[<>"\\&\x00-\x1f]/.test(input)) return false;
  return PERSON_NAME_PATTERN.test(input);
}

export function composePersonDisplayName(givenName: string, familyName: string): string {
  return [normalizePersonName(givenName), normalizePersonName(familyName)].filter(Boolean).join(' ');
}

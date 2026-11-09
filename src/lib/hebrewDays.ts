/** 0 → "היום", 1 → "מחר", 2 → "בעוד יומיים", n → "בעוד n ימים"; beyond the program → "בהמשך". */
export function inDays(n: number): string {
  if (n <= 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === 2) return 'בעוד יומיים';
  // Content set far beyond the program (e.g. a placeholder day): no count of thousands of days.
  if (n > 400) return 'בהמשך';
  return `בעוד ${n} ימים`;
}

/** Label for locked content: "נפתח מחר", "נפתח בעוד 5 ימים", or "נפתח בקרוב". */
export function opensIn(n: number): string {
  return n > 0 ? `נפתח ${inDays(n)}` : 'נפתח בקרוב';
}

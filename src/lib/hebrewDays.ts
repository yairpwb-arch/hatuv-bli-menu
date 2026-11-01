/** 0 → "היום", 1 → "מחר", 2 → "בעוד יומיים", n → "בעוד n ימים". */
export function inDays(n: number): string {
  if (n <= 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === 2) return 'בעוד יומיים';
  return `בעוד ${n} ימים`;
}

/** Label for locked content: "נפתח מחר", "נפתח בעוד 5 ימים", or "נפתח בקרוב". */
export function opensIn(n: number): string {
  return n > 0 ? `נפתח ${inDays(n)}` : 'נפתח בקרוב';
}

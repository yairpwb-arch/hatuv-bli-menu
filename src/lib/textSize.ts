/** Settings → text size. Scales the root font, which every rem size follows. */
export type TextSize = 'small' | 'normal' | 'large';

const KEY = 'textSize';
const ROOT_PX: Record<TextSize, number> = { small: 15, normal: 16, large: 17.5 };

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'small' || v === 'large' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size: TextSize = getTextSize()) {
  document.documentElement.style.fontSize = `${ROOT_PX[size]}px`;
}

export function setTextSize(size: TextSize) {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // Still applies for this session.
  }
  applyTextSize(size);
}

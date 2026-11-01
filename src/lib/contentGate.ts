// Stages unlock a WEEK at a time, not one-by-one: everything sharing the same
// week_range opens together once its date has come, as long as the previous
// week's stages are all completed — items within the same week never gate
// each other (no waiting for a sibling video to be marked watched before the
// next one in that same week opens). Re-run this any time completion state
// changes, not just once at fetch time — otherwise finishing a week never
// actually reveals the next one until the page is reloaded.
export function applySequentialGate<T extends { week_range: string; dateUnlocked: boolean; isCompleted: boolean }>(
  items: T[]
): (T & { isUnlocked: boolean })[] {
  const result: (T & { isUnlocked: boolean })[] = [];
  let previousWeekCompleted = true;
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length && items[j].week_range === items[i].week_range) j++;
    const weekItems = items.slice(i, j);
    for (const item of weekItems) {
      result.push({ ...item, isUnlocked: item.dateUnlocked && previousWeekCompleted });
    }
    previousWeekCompleted = weekItems.every((it) => it.isCompleted);
    i = j;
  }
  return result;
}

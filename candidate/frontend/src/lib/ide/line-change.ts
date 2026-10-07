/**
 * How big an edit was: lines added and lines removed between two versions of
 * a file. Recorded with each save as evidence of how the work proceeded — a
 * steady run of small edits reads differently from one save that adds two
 * hundred lines.
 *
 * It counts by comparing the lines as multisets, which is exact for the
 * totals (a changed line is one removed and one added) and takes no account
 * of position — moving a block is "no change". That is the right trade here:
 * it runs on every save of every dirty file, and what's wanted is the size
 * of the edit, not a patch. No DOM or React imports.
 */
export function lineChange(before: string, after: string): { added: number; removed: number } {
  if (before === after) return { added: 0, removed: 0 };
  const counts = new Map<string, number>();
  for (const line of before.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);

  let added = 0;
  for (const line of after.split("\n")) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added++;
  }
  let removed = 0;
  for (const left of counts.values()) removed += left;
  return { added, removed };
}

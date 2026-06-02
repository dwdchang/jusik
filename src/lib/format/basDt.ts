/**
 * "20260601" → "2026.06.01"
 */
export function formatBasDtDisplay(basDt: string): string {
  if (basDt.length !== 8) {
    return basDt;
  }
  return `${basDt.slice(0, 4)}.${basDt.slice(4, 6)}.${basDt.slice(6, 8)}`;
}
